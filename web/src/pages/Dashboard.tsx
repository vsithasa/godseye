import { createSignal, createEffect, For, Show, onCleanup } from 'solid-js';
import { supabase, Server, Heartbeat } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const [servers, setServers] = createSignal<Server[]>([]);
  const [heartbeats, setHeartbeats] = createSignal<Map<string, Heartbeat>>(new Map());
  const [loading, setLoading] = createSignal(true);
  const [user, setUser] = createSignal<any>(null);

  // Load servers and set up realtime subscriptions
  createEffect(async () => {
    // Get current user
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    setUser(currentUser);

    if (!currentUser) return;

    // Load servers
    await loadServers();

    // Set up realtime subscription for server updates
    const serverChannel = supabase
      .channel('servers-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'servers' },
        () => loadServers()
      )
      .subscribe();

    // Set up realtime subscription for heartbeats
    const heartbeatChannel = supabase
      .channel('heartbeats-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'heartbeats' },
        (payload) => {
          const newHeartbeat = payload.new as Heartbeat;
          setHeartbeats((prev) => {
            const newMap = new Map(prev);
            newMap.set(newHeartbeat.server_id, newHeartbeat);
            return newMap;
          });
        }
      )
      .subscribe();

    // Cleanup
    onCleanup(() => {
      supabase.removeChannel(serverChannel);
      supabase.removeChannel(heartbeatChannel);
    });
  });

  const loadServers = async () => {
    setLoading(true);
    try {
      // Load servers
      const { data: serversData, error: serversError } = await supabase
        .from('servers')
        .select('*')
        .order('last_seen', { ascending: false });

      if (serversError) throw serversError;
      setServers(serversData || []);

      // Load latest heartbeats for each server
      const { data: heartbeatsData, error: heartbeatsError } = await supabase
        .from('heartbeats')
        .select('*')
        .in('server_id', serversData?.map(s => s.id) || [])
        .order('ts', { ascending: false });

      if (heartbeatsError) throw heartbeatsError;

      // Keep only the latest heartbeat per server
      const heartbeatMap = new Map<string, Heartbeat>();
      heartbeatsData?.forEach((hb) => {
        if (!heartbeatMap.has(hb.server_id)) {
          heartbeatMap.set(hb.server_id, hb);
        }
      });
      setHeartbeats(heartbeatMap);
    } catch (error) {
      console.error('Error loading servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / 1024 / 1024 / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  };

  const getServerStatus = (lastSeen: string) => {
    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 1000 / 60;

    if (diffMinutes < 10) return { color: 'bg-green-500', text: 'Online' };
    if (diffMinutes < 60) return { color: 'bg-yellow-500', text: 'Stale' };
    return { color: 'bg-red-500', text: 'Offline' };
  };

  return (
    <div class="min-h-screen bg-slate-900">
      {/* Header */}
      <header class="bg-slate-800 border-b border-slate-700 shadow-lg">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <span class="text-3xl">👁️</span>
              <div>
                <h1 class="text-2xl font-bold text-white">Godseye</h1>
                <p class="text-sm text-slate-400">Fleet Monitoring</p>
              </div>
            </div>
            <div class="flex items-center space-x-4">
              <span class="text-sm text-slate-400">{user()?.email}</span>
              <button
                onClick={handleSignOut}
                class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div class="text-slate-400 text-sm font-medium mb-1">Total Servers</div>
            <div class="text-3xl font-bold text-white">{servers().length}</div>
          </div>
          <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div class="text-slate-400 text-sm font-medium mb-1">Online</div>
            <div class="text-3xl font-bold text-green-400">
              {servers().filter(s => getServerStatus(s.last_seen).text === 'Online').length}
            </div>
          </div>
          <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div class="text-slate-400 text-sm font-medium mb-1">Stale</div>
            <div class="text-3xl font-bold text-yellow-400">
              {servers().filter(s => getServerStatus(s.last_seen).text === 'Stale').length}
            </div>
          </div>
          <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div class="text-slate-400 text-sm font-medium mb-1">Offline</div>
            <div class="text-3xl font-bold text-red-400">
              {servers().filter(s => getServerStatus(s.last_seen).text === 'Offline').length}
            </div>
          </div>
        </div>

        {/* Server List */}
        <Show
          when={!loading()}
          fallback={
            <div class="text-center py-12 text-slate-400">Loading servers...</div>
          }
        >
          <Show
            when={servers().length > 0}
            fallback={
              <div class="bg-slate-800 rounded-lg p-12 text-center border border-slate-700">
                <div class="text-slate-400 mb-4">
                  <span class="text-4xl mb-4 block">📡</span>
                  <p class="text-lg">No servers enrolled yet</p>
                  <p class="text-sm mt-2">Install the agent on your Ubuntu servers to get started</p>
                </div>
              </div>
            }
          >
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <For each={servers()}>
                {(server) => {
                  const status = () => getServerStatus(server.last_seen);
                  const heartbeat = () => heartbeats().get(server.id);

                  return (
                    <div class="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-slate-600 transition-colors">
                      {/* Server Header */}
                      <div class="flex items-start justify-between mb-4">
                        <div class="flex-1">
                          <div class="flex items-center space-x-3 mb-2">
                            <h3 class="text-xl font-semibold text-white">{server.hostname}</h3>
                            <div class="flex items-center space-x-2">
                              <span class={`w-2 h-2 rounded-full ${status().color} animate-pulse`}></span>
                              <span class="text-sm text-slate-400">{status().text}</span>
                            </div>
                          </div>
                          <p class="text-sm text-slate-400">
                            {server.os_name} {server.os_version} • {server.kernel}
                          </p>
                        </div>
                      </div>

                      {/* System Info */}
                      <div class="space-y-3">
                        <div class="flex items-center justify-between text-sm">
                          <span class="text-slate-400">CPU</span>
                          <span class="text-white font-medium">{server.cpu_model}</span>
                        </div>
                        <div class="flex items-center justify-between text-sm">
                          <span class="text-slate-400">Memory</span>
                          <span class="text-white font-medium">{formatBytes(server.mem_bytes)}</span>
                        </div>
                        <Show when={heartbeat()}>
                          <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-400">Uptime</span>
                            <span class="text-white font-medium">{formatUptime(heartbeat()!.uptime_s)}</span>
                          </div>
                          <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-400">CPU Usage</span>
                            <span class="text-white font-medium">{heartbeat()!.cpu_pct.toFixed(1)}%</span>
                          </div>
                          <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-400">Memory Used</span>
                            <span class="text-white font-medium">{formatBytes(heartbeat()!.mem_used)}</span>
                          </div>
                          <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-400">Load Avg</span>
                            <span class="text-white font-medium">
                              {heartbeat()!.load_m1.toFixed(2)} / {heartbeat()!.load_m5.toFixed(2)} / {heartbeat()!.load_m15.toFixed(2)}
                            </span>
                          </div>
                        </Show>
                      </div>

                      {/* Footer */}
                      <div class="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
                        <span>Agent v{server.agent_version}</span>
                        <span title={server.last_seen}>
                          Last seen {formatDistanceToNow(new Date(server.last_seen), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </main>
    </div>
  );
}

