import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Database types
export interface Server {
  id: string;
  agent_id: string;
  org_id: string;
  hostname: string;
  machine_id: string;
  os_name: string;
  os_version: string;
  kernel: string;
  cpu_model: string;
  mem_bytes: number;
  agent_version: string;
  tags: Record<string, string>;
  first_seen: string;
  last_seen: string;
}

export interface Heartbeat {
  id: string;
  server_id: string;
  ts: string;
  uptime_s: number;
  load_m1: number;
  load_m5: number;
  load_m15: number;
  cpu_pct: number;
  mem_used: number;
  mem_free: number;
  swap_used: number;
}

export interface Disk {
  id: string;
  server_id: string;
  mount: string;
  fs: string;
  size_bytes: number;
  used_bytes: number;
}

export interface NetworkInterface {
  id: string;
  server_id: string;
  name: string;
  mac: string | null;
  ipv4: string | null;
  ipv6: string | null;
  bytes_sent: number;
  bytes_recv: number;
  packets_sent: number;
  packets_recv: number;
  errin: number;
  errout: number;
  dropin: number;
  dropout: number;
}

export interface Process {
  id: string;
  server_id: string;
  ts: string;
  pid: number;
  cmd: string;
  cpu_pct: number;
  mem_bytes: number;
  usr: string;
}

export interface Log {
  id: string;
  server_id: string;
  ts: string;
  source: string;
  level: string;
  message: string;
  raw: any;
}
