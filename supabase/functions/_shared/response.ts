// Standard JSON response helpers

export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-timestamp, x-nonce, x-signature, x-agent-version",
    },
  });
}

export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function validationErrorResponse(errors: unknown): Response {
  return jsonResponse({ error: "Validation failed", details: errors }, 422);
}

export function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-timestamp, x-nonce, x-signature, x-agent-version",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

export function handleCORS(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

