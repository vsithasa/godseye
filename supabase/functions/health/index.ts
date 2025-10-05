import { jsonResponse, handleCORS } from "../_shared/response.ts";

// GET /health
// Simple health check endpoint
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCORS();
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  return jsonResponse({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

