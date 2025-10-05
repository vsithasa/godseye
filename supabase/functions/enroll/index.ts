import { EnrollRequestSchema } from "../_shared/schema.ts";
import {
  createAgentJWT,
  generateSecret,
  hashSecret,
} from "../_shared/auth.ts";
import {
  createServiceClient,
  getOrgBySecretHash,
} from "../_shared/db.ts";
import {
  jsonResponse,
  errorResponse,
  validationErrorResponse,
  handleCORS,
} from "../_shared/response.ts";

// POST /enroll
// Enrolls a new server and returns agent credentials
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCORS();
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    // Parse and validate request body
    const body = await req.json();
    const parsed = EnrollRequestSchema.safeParse(body);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error.format());
    }

    const { org_enroll_secret, host_facts } = parsed.data;

    // Hash the provided secret to look up org
    const secretHash = await hashSecret(org_enroll_secret);
    const client = createServiceClient();

    // Find org by secret hash
    const org = await getOrgBySecretHash(client, secretHash);
    if (!org) {
      return errorResponse("Invalid enrollment secret", 403);
    }

    // Check if server already exists by machine_id (idempotent enrollment)
    const { data: existingServer } = await client
      .from("servers")
      .select("agent_id, hmac_secret, refresh_token")
      .eq("org_id", org.id)
      .eq("machine_id", host_facts.machine_id)
      .single();

    let agentId: string;
    let hmacSecret: string;
    let refreshToken: string;

    if (existingServer) {
      // Re-enrollment: return existing credentials
      agentId = existingServer.agent_id;
      hmacSecret = existingServer.hmac_secret;
      refreshToken = existingServer.refresh_token;

      // Update server facts
      await client
        .from("servers")
        .update({
          hostname: host_facts.hostname,
          os_name: host_facts.os.name,
          os_version: host_facts.os.version,
          kernel: host_facts.kernel,
          cpu_model: host_facts.cpu.model,
          cores: host_facts.cpu.cores,
          mem_bytes: host_facts.mem_bytes,
          agent_version: host_facts.agent_version,
          tags: host_facts.tags || {},
          last_seen: new Date().toISOString(),
        })
        .eq("agent_id", agentId);
    } else {
      // New enrollment: create server
      agentId = crypto.randomUUID();
      hmacSecret = generateSecret(32);
      refreshToken = generateSecret(64);

      await client.from("servers").insert({
        org_id: org.id,
        agent_id: agentId,
        hostname: host_facts.hostname,
        machine_id: host_facts.machine_id,
        os_name: host_facts.os.name,
        os_version: host_facts.os.version,
        kernel: host_facts.kernel,
        cpu_model: host_facts.cpu.model,
        cores: host_facts.cpu.cores,
        mem_bytes: host_facts.mem_bytes,
        agent_version: host_facts.agent_version,
        tags: host_facts.tags || {},
        hmac_secret: hmacSecret,
        refresh_token: refreshToken,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      });
    }

    // Generate JWT
    const agentJwt = await createAgentJWT(agentId, org.id);

    return jsonResponse({
      agent_id: agentId,
      agent_jwt: agentJwt,
      refresh_token: refreshToken,
      hmac_secret: hmacSecret,
      org_id: org.id,
    });
  } catch (error) {
    console.error("Enroll error:", error);
    return errorResponse(`Internal server error: ${error.message}`, 500);
  }
});

