import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Create Supabase client with service role key (bypasses RLS)
export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Check if nonce has been used (replay protection)
export async function isNonceUsed(
  client: SupabaseClient,
  orgId: string,
  agentId: string,
  nonce: string
): Promise<boolean> {
  const { data, error } = await client
    .from("api_nonces")
    .select("id")
    .eq("org_id", orgId)
    .eq("agent_id", agentId)
    .eq("nonce", nonce)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = not found, which is what we want
    throw error;
  }

  return data !== null;
}

// Store nonce to prevent replay
export async function storeNonce(
  client: SupabaseClient,
  orgId: string,
  agentId: string,
  nonce: string
): Promise<void> {
  const { error } = await client.from("api_nonces").insert({
    org_id: orgId,
    agent_id: agentId,
    nonce,
    ts: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}

// Cleanup old nonces (call periodically or in scheduled function)
export async function cleanupOldNonces(
  client: SupabaseClient,
  minutesOld: number = 10
): Promise<number> {
  const cutoff = new Date(Date.now() - minutesOld * 60 * 1000).toISOString();
  
  const { error, count } = await client
    .from("api_nonces")
    .delete()
    .lt("ts", cutoff);

  if (error) {
    throw error;
  }

  return count || 0;
}

// Get org by enroll secret hash
export async function getOrgBySecretHash(
  client: SupabaseClient,
  secretHash: string
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await client
    .from("orgs")
    .select("id, name")
    .eq("enroll_secret_hash", secretHash)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data;
}

// Get server by agent_id
export async function getServerByAgentId(
  client: SupabaseClient,
  agentId: string
): Promise<{
  id: string;
  org_id: string;
  hmac_secret: string;
  refresh_token: string;
} | null> {
  const { data, error } = await client
    .from("servers")
    .select("id, org_id, hmac_secret, refresh_token")
    .eq("agent_id", agentId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data;
}

