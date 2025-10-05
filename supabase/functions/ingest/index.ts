import { IngestPayloadSchema } from "../_shared/schema.ts";
import {
  verifyAgentJWT,
  validateTimestamp,
  verifyHMAC,
  hashBody,
} from "../_shared/auth.ts";
import {
  createServiceClient,
  getServerByAgentId,
  isNonceUsed,
  storeNonce,
} from "../_shared/db.ts";
import {
  jsonResponse,
  errorResponse,
  validationErrorResponse,
  handleCORS,
} from "../_shared/response.ts";

// POST /ingest
// Receives and stores metrics from agents
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCORS();
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    // Extract headers
    const authHeader = req.headers.get("Authorization");
    const timestamp = req.headers.get("X-Timestamp");
    const nonce = req.headers.get("X-Nonce");
    const signature = req.headers.get("X-Signature");
    const agentVersion = req.headers.get("X-Agent-Version");

    if (!authHeader || !timestamp || !nonce || !signature) {
      return errorResponse("Missing required headers", 400);
    }

    // Validate timestamp (±5 minutes)
    if (!validateTimestamp(timestamp)) {
      return errorResponse("Invalid or expired timestamp", 401);
    }

    // Extract JWT from Authorization header
    const token = authHeader.replace(/^Bearer\s+/i, "");
    
    // Verify JWT
    let jwtPayload;
    try {
      jwtPayload = await verifyAgentJWT(token);
    } catch (error) {
      return errorResponse(`JWT verification failed: ${error.message}`, 401);
    }

    const { agentId, orgId } = jwtPayload;

    // Get server details (to retrieve HMAC secret)
    const client = createServiceClient();
    const server = await getServerByAgentId(client, agentId);

    if (!server) {
      return errorResponse("Server not found", 403);
    }

    if (server.org_id !== orgId) {
      return errorResponse("Organization mismatch", 403);
    }

    // Check nonce (replay protection)
    if (await isNonceUsed(client, orgId, agentId, nonce)) {
      return errorResponse("Nonce already used (replay detected)", 409);
    }

    // Read and decompress body
    const contentEncoding = req.headers.get("Content-Encoding");
    let bodyText: string;

    if (contentEncoding === "gzip") {
      // Decompress gzip
      const bodyBytes = await req.arrayBuffer();
      const decompressedStream = new Response(
        new Blob([bodyBytes]).stream().pipeThrough(new DecompressionStream("gzip"))
      );
      bodyText = await decompressedStream.text();
    } else {
      bodyText = await req.text();
    }

    // Verify HMAC signature
    const bodyHash = await hashBody(bodyText);
    const isValidHMAC = await verifyHMAC(
      server.hmac_secret,
      timestamp,
      nonce,
      bodyHash,
      signature
    );

    if (!isValidHMAC) {
      return errorResponse("Invalid HMAC signature", 403);
    }

    // Store nonce to prevent replay
    await storeNonce(client, orgId, agentId, nonce);

    // Parse and validate payload
    const payload = JSON.parse(bodyText);
    const parsed = IngestPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error.format());
    }

    const data = parsed.data;
    const now = new Date().toISOString();

    // Start transaction-like operations
    // 1. Upsert server identity (update last_seen and any changed facts)
    await client
      .from("servers")
      .update({
        hostname: data.server.hostname,
        os_name: data.server.os.name,
        os_version: data.server.os.version,
        kernel: data.server.kernel,
        cpu_model: data.server.cpu.model,
        cores: data.server.cpu.cores,
        mem_bytes: data.server.mem_bytes,
        agent_version: data.server.agent_version,
        tags: data.server.tags || {},
        last_seen: now,
      })
      .eq("agent_id", agentId);

    // 2. Insert heartbeat
    await client.from("heartbeats").insert({
      org_id: orgId,
      server_id: server.id,
      ts: data.heartbeat.ts,
      uptime_s: data.heartbeat.uptime_s,
      load_1m: data.heartbeat.load.m1,
      load_5m: data.heartbeat.load.m5,
      load_15m: data.heartbeat.load.m15,
      cpu_pct: data.heartbeat.cpu_pct,
      mem_used: data.heartbeat.mem.used,
      mem_free: data.heartbeat.mem.free,
      swap_used: data.heartbeat.mem.swap_used,
    });

    // 3. Insert disks (if any)
    if (data.disks && data.disks.length > 0) {
      const diskRows = data.disks.map((disk) => ({
        org_id: orgId,
        server_id: server.id,
        ts: now,
        mount: disk.mount,
        fs: disk.fs,
        size_bytes: disk.size_bytes,
        used_bytes: disk.used_bytes,
        inodes_used: disk.inodes_used,
      }));
      await client.from("disks").insert(diskRows);
    }

    // 4. Insert network interfaces (if any)
    if (data.network_ifaces && data.network_ifaces.length > 0) {
      const netRows = data.network_ifaces.map((iface) => ({
        org_id: orgId,
        server_id: server.id,
        ts: now,
        name: iface.name,
        mac: iface.mac,
        ipv4: iface.ipv4,
        ipv6: iface.ipv6,
        rx_bytes: iface.rx_bytes,
        tx_bytes: iface.tx_bytes,
      }));
      await client.from("network_ifaces").insert(netRows);
    }

    // 5. Insert processes (if any)
    if (data.processes && data.processes.length > 0) {
      const processRows = data.processes.map((proc) => ({
        org_id: orgId,
        server_id: server.id,
        ts: now,
        pid: proc.pid,
        cmd: proc.cmd,
        cpu_pct: proc.cpu_pct,
        mem_bytes: proc.mem_bytes,
        usr: proc.user,
      }));
      await client.from("processes").insert(processRows);
    }

    // 6. Insert packages (if any)
    if (data.packages && data.packages.length > 0) {
      const packageRows = data.packages.map((pkg) => ({
        org_id: orgId,
        server_id: server.id,
        ts: now,
        name: pkg.name,
        version: pkg.version,
        status: pkg.status,
      }));
      await client.from("packages").insert(packageRows);
    }

    // 7. Insert updates summary (if provided)
    if (data.updates) {
      await client.from("updates").insert({
        org_id: orgId,
        server_id: server.id,
        ts: now,
        security_updates_count: data.updates.security_updates_count,
        regular_updates_count: data.updates.regular_updates_count,
        details: data.updates.details,
      });
    }

    // 8. Insert logs (if any)
    if (data.logs && data.logs.length > 0) {
      const logRows = data.logs.map((log) => ({
        org_id: orgId,
        server_id: server.id,
        ts: log.ts,
        source: log.source,
        level: log.level,
        message: log.message,
        raw: log.raw,
      }));
      await client.from("logs").insert(logRows);
    }

    return jsonResponse({ success: true, received_at: now });
  } catch (error) {
    console.error("Ingest error:", error);
    return errorResponse(`Internal server error: ${error.message}`, 500);
  }
});

