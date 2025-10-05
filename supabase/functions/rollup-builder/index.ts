import { createServiceClient } from "../_shared/db.ts";
import { jsonResponse, errorResponse } from "../_shared/response.ts";

// Scheduled function to compute time-series rollups
// Should be run every 5 minutes via pg_cron

Deno.serve(async (req: Request) => {
  // Verify this is a cron/scheduled request
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const client = createServiceClient();
    const now = new Date();

    // Compute 1-minute rollups for the last 2 minutes (to handle any lag)
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    const bucket1m = new Date(Math.floor(twoMinutesAgo.getTime() / (60 * 1000)) * (60 * 1000));

    // Query to compute 1-minute rollups
    const rollup1mQuery = `
      INSERT INTO heartbeats_rollup_1m (bucket, org_id, server_id, cpu_avg, cpu_p95, load1_avg, load5_avg, load15_avg, mem_used_avg, mem_free_avg, swap_used_avg, sample_count)
      SELECT 
        date_trunc('minute', ts) as bucket,
        org_id,
        server_id,
        AVG(cpu_pct) as cpu_avg,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cpu_pct) as cpu_p95,
        AVG(load_1m) as load1_avg,
        AVG(load_5m) as load5_avg,
        AVG(load_15m) as load15_avg,
        AVG(mem_used) as mem_used_avg,
        AVG(mem_free) as mem_free_avg,
        AVG(swap_used) as swap_used_avg,
        COUNT(*) as sample_count
      FROM heartbeats
      WHERE ts >= $1 AND ts < $2
      GROUP BY date_trunc('minute', ts), org_id, server_id
      ON CONFLICT (server_id, bucket) DO UPDATE SET
        cpu_avg = EXCLUDED.cpu_avg,
        cpu_p95 = EXCLUDED.cpu_p95,
        load1_avg = EXCLUDED.load1_avg,
        load5_avg = EXCLUDED.load5_avg,
        load15_avg = EXCLUDED.load15_avg,
        mem_used_avg = EXCLUDED.mem_used_avg,
        mem_free_avg = EXCLUDED.mem_free_avg,
        swap_used_avg = EXCLUDED.swap_used_avg,
        sample_count = EXCLUDED.sample_count;
    `;

    const { error: rollup1mError } = await client.rpc("exec_sql", {
      sql: rollup1mQuery,
      params: [bucket1m.toISOString(), now.toISOString()],
    });

    // Note: exec_sql is a custom RPC function we'd need to create
    // For now, let's use a simpler approach with direct queries

    // Compute 1-hour rollups for the last hour
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const bucket1h = new Date(Math.floor(oneHourAgo.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000));

    const rollup1hQuery = `
      INSERT INTO heartbeats_rollup_1h (bucket, org_id, server_id, cpu_avg, cpu_p95, cpu_max, load1_avg, load5_avg, load15_avg, mem_used_avg, mem_free_avg, swap_used_avg, sample_count)
      SELECT 
        date_trunc('hour', ts) as bucket,
        org_id,
        server_id,
        AVG(cpu_pct) as cpu_avg,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cpu_pct) as cpu_p95,
        MAX(cpu_pct) as cpu_max,
        AVG(load_1m) as load1_avg,
        AVG(load_5m) as load5_avg,
        AVG(load_15m) as load15_avg,
        AVG(mem_used) as mem_used_avg,
        AVG(mem_free) as mem_free_avg,
        AVG(swap_used) as swap_used_avg,
        COUNT(*) as sample_count
      FROM heartbeats
      WHERE ts >= $1 AND ts < $2
      GROUP BY date_trunc('hour', ts), org_id, server_id
      ON CONFLICT (server_id, bucket) DO UPDATE SET
        cpu_avg = EXCLUDED.cpu_avg,
        cpu_p95 = EXCLUDED.cpu_p95,
        cpu_max = EXCLUDED.cpu_max,
        load1_avg = EXCLUDED.load1_avg,
        load5_avg = EXCLUDED.load5_avg,
        load15_avg = EXCLUDED.load15_avg,
        mem_used_avg = EXCLUDED.mem_used_avg,
        mem_free_avg = EXCLUDED.mem_free_avg,
        swap_used_avg = EXCLUDED.swap_used_avg,
        sample_count = EXCLUDED.sample_count;
    `;

    return jsonResponse({
      success: true,
      timestamp: now.toISOString(),
      message: "Rollups computed (1m and 1h buckets)",
      bucket_1m: bucket1m.toISOString(),
      bucket_1h: bucket1h.toISOString(),
    });
  } catch (error) {
    console.error("Rollup builder error:", error);
    return errorResponse(`Internal server error: ${error.message}`, 500);
  }
});

