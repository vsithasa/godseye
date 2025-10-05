import { createServiceClient } from "../_shared/db.ts";
import { jsonResponse, errorResponse } from "../_shared/response.ts";

// Scheduled function to detect offline servers and create/clear alerts
// Should be run every 5 minutes via pg_cron or Supabase Cron

const OFFLINE_THRESHOLD_MINUTES = 10;

Deno.serve(async (req: Request) => {
  // Verify this is a cron/scheduled request (optional: add auth check)
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const client = createServiceClient();
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000);

    // Find servers that are offline (last_seen > 10 minutes ago)
    const { data: offlineServers, error: fetchError } = await client
      .from("servers")
      .select("id, org_id, hostname, last_seen")
      .lt("last_seen", cutoffTime.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    let alertsCreated = 0;
    let alertsCleared = 0;

    // Create alerts for offline servers (if not already open)
    for (const server of offlineServers || []) {
      const { data: existingAlert } = await client
        .from("alerts")
        .select("id, status")
        .eq("server_id", server.id)
        .eq("type", "offline")
        .eq("status", "open")
        .single();

      if (!existingAlert) {
        // Create new offline alert
        await client.from("alerts").insert({
          org_id: server.org_id,
          server_id: server.id,
          ts: now.toISOString(),
          type: "offline",
          severity: "critical",
          message: `Server ${server.hostname} is offline (last seen: ${server.last_seen})`,
          status: "open",
        });
        alertsCreated++;
      }
    }

    // Find servers that are back online (last_seen < 10 minutes ago)
    const { data: onlineServers, error: onlineError } = await client
      .from("servers")
      .select("id, org_id, hostname")
      .gte("last_seen", cutoffTime.toISOString());

    if (onlineError) {
      throw onlineError;
    }

    // Clear offline alerts for servers that are back online
    for (const server of onlineServers || []) {
      const { data: openAlert } = await client
        .from("alerts")
        .select("id")
        .eq("server_id", server.id)
        .eq("type", "offline")
        .eq("status", "open")
        .single();

      if (openAlert) {
        await client
          .from("alerts")
          .update({ status: "cleared" })
          .eq("id", openAlert.id);
        alertsCleared++;
      }
    }

    return jsonResponse({
      success: true,
      timestamp: now.toISOString(),
      offline_servers: offlineServers?.length || 0,
      alerts_created: alertsCreated,
      alerts_cleared: alertsCleared,
    });
  } catch (error) {
    console.error("Offline detector error:", error);
    return errorResponse(`Internal server error: ${error.message}`, 500);
  }
});

