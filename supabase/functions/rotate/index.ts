import { RotateRequestSchema } from "../_shared/schema.ts";
import { createAgentJWT, generateSecret } from "../_shared/auth.ts";
import { createServiceClient, getServerByAgentId } from "../_shared/db.ts";
import {
  jsonResponse,
  errorResponse,
  validationErrorResponse,
  handleCORS,
} from "../_shared/response.ts";

// POST /rotate
// Rotates JWT and optionally refresh token
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
    const parsed = RotateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error.format());
    }

    const { agent_id, refresh_token } = parsed.data;

    // Get server and validate refresh token
    const client = createServiceClient();
    const server = await getServerByAgentId(client, agent_id);

    if (!server) {
      return errorResponse("Invalid agent ID", 403);
    }

    if (server.refresh_token !== refresh_token) {
      return errorResponse("Invalid refresh token", 403);
    }

    // Generate new JWT
    const newJwt = await createAgentJWT(agent_id, server.org_id);

    // Generate new refresh token (optional, but recommended for security)
    const newRefreshToken = generateSecret(64);

    // Update refresh token in database
    await client
      .from("servers")
      .update({
        refresh_token: newRefreshToken,
        last_seen: new Date().toISOString(),
      })
      .eq("agent_id", agent_id);

    return jsonResponse({
      agent_jwt: newJwt,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    console.error("Rotate error:", error);
    return errorResponse(`Internal server error: ${error.message}`, 500);
  }
});

