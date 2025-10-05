import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Server identity and facts
export const ServerIdentitySchema = z.object({
  agent_id: z.string().uuid().optional(), // Optional on first enroll
  hostname: z.string().min(1),
  machine_id: z.string().min(1),
  os: z.object({
    name: z.string(),
    version: z.string(),
  }),
  kernel: z.string(),
  cpu: z.object({
    model: z.string(),
    cores: z.number().int().positive(),
  }),
  mem_bytes: z.number().int().positive(),
  agent_version: z.string(),
  tags: z.record(z.unknown()).optional().default({}),
});

// Heartbeat metrics
export const HeartbeatSchema = z.object({
  ts: z.string().datetime(),
  uptime_s: z.number().int().nonnegative(),
  load: z.object({
    m1: z.number().nonnegative(),
    m5: z.number().nonnegative(),
    m15: z.number().nonnegative(),
  }),
  cpu_pct: z.number().min(0).max(100),
  mem: z.object({
    used: z.number().int().nonnegative(),
    free: z.number().int().nonnegative(),
    swap_used: z.number().int().nonnegative(),
  }),
});

// Disk metrics
export const DiskSchema = z.object({
  mount: z.string(),
  fs: z.string(),
  size_bytes: z.number().int().nonnegative(),
  used_bytes: z.number().int().nonnegative(),
  inodes_used: z.number().int().nonnegative().optional(),
});

// Network interface
export const NetworkInterfaceSchema = z.object({
  name: z.string(),
  mac: z.string().optional(),
  ipv4: z.array(z.string()).optional().default([]),
  ipv6: z.array(z.string()).optional().default([]),
  rx_bytes: z.number().int().nonnegative(),
  tx_bytes: z.number().int().nonnegative(),
});

// Process
export const ProcessSchema = z.object({
  pid: z.number().int().positive(),
  cmd: z.string(),
  cpu_pct: z.number().nonnegative(),
  mem_bytes: z.number().int().nonnegative(),
  usr: z.string(),
});

// Package
export const PackageSchema = z.object({
  name: z.string(),
  version: z.string(),
  status: z.string().optional(),
});

// Updates summary
export const UpdatesSchema = z.object({
  security_updates_count: z.number().int().nonnegative(),
  regular_updates_count: z.number().int().nonnegative(),
  details: z.array(z.record(z.unknown())).optional().default([]),
});

// Log entry
export const LogSchema = z.object({
  ts: z.string().datetime(),
  source: z.string(),
  level: z.string(),
  message: z.string(),
  raw: z.record(z.unknown()).optional().default({}),
});

// Full ingest payload
export const IngestPayloadSchema = z.object({
  server: ServerIdentitySchema,
  heartbeat: HeartbeatSchema,
  disks: z.array(DiskSchema).optional().default([]),
  network_ifaces: z.array(NetworkInterfaceSchema).optional().default([]),
  processes: z.array(ProcessSchema).max(50).optional().default([]), // Cap at 50
  packages: z.array(PackageSchema).optional().default([]),
  updates: UpdatesSchema.optional(),
  logs: z.array(LogSchema).max(200).optional().default([]), // Cap at 200
});

// Enroll request
export const EnrollRequestSchema = z.object({
  org_enroll_secret: z.string().min(32),
  host_facts: ServerIdentitySchema.omit({ agent_id: true }),
});

// Enroll response
export const EnrollResponseSchema = z.object({
  agent_id: z.string().uuid(),
  agent_jwt: z.string(),
  refresh_token: z.string(),
  hmac_secret: z.string(),
  org_id: z.string().uuid(),
});

// Rotate request
export const RotateRequestSchema = z.object({
  agent_id: z.string().uuid(),
  refresh_token: z.string(),
});

// Rotate response
export const RotateResponseSchema = z.object({
  agent_jwt: z.string(),
  refresh_token: z.string(),
});

// Types
export type ServerIdentity = z.infer<typeof ServerIdentitySchema>;
export type Heartbeat = z.infer<typeof HeartbeatSchema>;
export type Disk = z.infer<typeof DiskSchema>;
export type NetworkInterface = z.infer<typeof NetworkInterfaceSchema>;
export type Process = z.infer<typeof ProcessSchema>;
export type Package = z.infer<typeof PackageSchema>;
export type Updates = z.infer<typeof UpdatesSchema>;
export type Log = z.infer<typeof LogSchema>;
export type IngestPayload = z.infer<typeof IngestPayloadSchema>;
export type EnrollRequest = z.infer<typeof EnrollRequestSchema>;
export type EnrollResponse = z.infer<typeof EnrollResponseSchema>;
export type RotateRequest = z.infer<typeof RotateRequestSchema>;
export type RotateResponse = z.infer<typeof RotateResponseSchema>;

