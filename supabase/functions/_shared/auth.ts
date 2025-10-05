import { create, getNumericDate, Payload } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const JWT_SECRET = Deno.env.get("JWT_SECRET") || "";
const JWT_ISSUER = "godseye";
const JWT_AUDIENCE = "agent";
const JWT_TTL_MINUTES = 60; // 60-minute JWT lifetime

// Generate HMAC-SHA256 signature
export async function computeHMAC(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Verify HMAC signature from request
export async function verifyHMAC(
  hmacSecret: string,
  timestamp: string,
  nonce: string,
  bodyHash: string,
  providedSignature: string
): Promise<boolean> {
  const canonicalMessage = `${timestamp}\n${nonce}\n${bodyHash}`;
  const expectedSignature = await computeHMAC(hmacSecret, canonicalMessage);
  return expectedSignature === providedSignature;
}

// Hash body content (SHA-256)
export async function hashBody(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Create JWT for agent
export async function createAgentJWT(
  agentId: string,
  orgId: string
): Promise<string> {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable not set");
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const payload: Payload = {
    sub: agentId,
    org_id: orgId,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    exp: getNumericDate(JWT_TTL_MINUTES * 60), // TTL in seconds
    iat: getNumericDate(0),
  };

  return await create({ alg: "HS256", typ: "JWT" }, payload, key);
}

// Verify and decode agent JWT
export async function verifyAgentJWT(token: string): Promise<{
  agentId: string;
  orgId: string;
}> {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable not set");
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Parse JWT manually for verification
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    
    // Verify signature
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      data
    );

    if (!valid) {
      throw new Error("Invalid JWT signature");
    }

    // Decode payload
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error("JWT expired");
    }

    // Check issuer and audience
    if (payload.iss !== JWT_ISSUER || payload.aud !== JWT_AUDIENCE) {
      throw new Error("Invalid JWT issuer or audience");
    }

    return {
      agentId: payload.sub,
      orgId: payload.org_id,
    };
  } catch (error) {
    throw new Error(`JWT verification failed: ${error.message}`);
  }
}

// Generate random secret (for HMAC or refresh tokens)
export function generateSecret(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Hash password/secret (SHA-256)
export async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Validate timestamp (within 5 minutes)
export function validateTimestamp(timestamp: string): boolean {
  try {
    const ts = new Date(timestamp).getTime();
    const now = Date.now();
    const diffMinutes = Math.abs(now - ts) / (1000 * 60);
    return diffMinutes <= 5;
  } catch {
    return false;
  }
}

