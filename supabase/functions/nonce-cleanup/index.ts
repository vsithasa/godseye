import { createServiceClient, cleanupOldNonces } from "../_shared/db.ts";
import { jsonResponse, errorResponse } from "../_shared/response.ts";

// Scheduled function to cleanup old nonces
// Should be run every 15-30 minutes via pg_cron

Deno.serve(async (req: Request) => {
  // Verify this is a cron/scheduled request
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const client = createServiceClient();
    
    // Remove nonces older than 10 minutes (beyond replay window)
    const deletedCount = await cleanupOldNonces(client, 10);

    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      nonces_deleted: deletedCount,
    });
  } catch (error) {
    console.error("Nonce cleanup error:", error);
    return errorResponse(`Internal server error: ${error.message}`, 500);
  }
});

