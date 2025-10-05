import { createSignal, createEffect, For, Show, onMount } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { supabase, type Server, type Heartbeat, type Disk, type NetworkInterface, type Process } from '../lib/supabase';
import { formatDistanceToNow, format } from 'date-fns';
import { Line } from 'solid-chartjs';
import { Chart, Title, Tooltip, Legend, Colors, LineElement, PointElement, LinearScale, CategoryScale, Filler } from 'chart.js';

// Register Chart.js components
Chart.register(Title, Tooltip, Legend, Colors, LineElement, PointElement, LinearScale, CategoryScale, Filler);

export default function ServerDetail() {
  const params = useParams();
  const [server, setServer] = createSignal<Server | null>(null);
  const [heartbeats, setHeartbeats] = createSignal<Heartbeat[]>([]);
  const [disks, setDisks] = createSignal<Disk[]>([]);
  const [network, setNetwork] = createSignal<NetworkInterface[]>([]);
  const [processes, setProcesses] = createSignal<Process[]>([]);
  const [packages, setPackages] = createSignal<any[]>([]);
  const [logs, setLogs] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Load data
  createEffect(async () => {
    const serverId = params.id;
    if (!serverId) return;

    setLoading(true);
    try {
      // Load server info
      const { data: serverData } = await supabase
        .from('servers')
        .select('*')
        .eq('id', serverId)
        .single();
      setServer(serverData);

      // Load last 24h of heartbeats
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: heartbeatsData } = await supabase
        .from('heartbeats')
        .select('*')
        .eq('server_id', serverId)
        .gte('ts', oneDayAgo)
        .order('ts', { ascending: true })
        .limit(288); // ~5 min intervals for 24h
      setHeartbeats(heartbeatsData || []);

      // Load disks
      const { data: disksData } = await supabase
        .from('disks')
        .select('*')
        .eq('server_id', serverId);
      setDisks(disksData || []);

      // Load network interfaces
      const { data: networkData } = await supabase
        .from('network_ifaces')
        .select('*')
        .eq('server_id', serverId);
      setNetwork(networkData || []);

      // Load recent processes
      const { data: processesData } = await supabase
        .from('processes')
        .select('*')
        .eq('server_id', serverId)
        .order('ts', { ascending: false })
        .limit(1);
      
      if (processesData && processesData.length > 0) {
        const latestTs = processesData[0].ts;
        const { data: topProcesses } = await supabase
          .from('processes')
          .select('*')
          .eq('server_id', serverId)
          .eq('ts', latestTs)
          .order('cpu_pct', { ascending: false })
          .limit(10);
        setProcesses(topProcesses || []);
      }

      // Load packages
      const { data: packagesData } = await supabase
        .from('packages')
        .select('*')
        .eq('server_id', serverId)
        .order('name')
        .limit(50);
      setPackages(packagesData || []);

      // Load recent logs
      const { data: logsData } = await supabase
        .from('logs')
        .select('*')
        .eq('server_id', serverId)
        .order('ts', { ascending: false })
        .limit(50);
      setLogs(logsData || []);

    } catch (error) {
      console.error('Error loading server details:', error);
    } finally {
      setLoading(false);
    }
  });

  const formatBytes = (bytes: number) => {
    const gb = bytes / 1024 / 1024 / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  };

  // Chart data
  const cpuChartData = () => {
    const hbs = heartbeats();
    if (hbs.length === 0) return null;

    return {
      labels: hbs.map(h => format(new Date(h.ts), 'HH:mm')),
      datasets: [{
        label: 'CPU Usage (%)',
        data: hbs.map(h => h.cpu_pct || 0),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      }]
    };
  };

  const memoryChartData = () => {
    const hbs = heartbeats();
    if (hbs.length === 0) return null;

    const serverMem = server()?.mem_bytes || 1;
    return {
      labels: hbs.map(h => format(new Date(h.ts), 'HH:mm')),
      datasets: [{
        label: 'Memory Usage (%)',
        data: hbs.map(h => ((h.mem_used || 0) / serverMem) * 100),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      }]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: { color: 'rgba(255, 255, 255, 0.7)' }
      },
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { 
          color: 'rgba(255, 255, 255, 0.7)',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 12
        }
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  };

  return (
    <div class="min-h-screen bg-slate-900">
      {/* Header */}
      <header class="bg-slate-800 border-b border-slate-700 shadow-lg">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <A href="/" class="text-slate-400 hover:text-white transition-colors">
                ← Back
              </A>
              <Show when={server()}>
                {(s) => (
                  <>
                    <span class="text-slate-600">|</span>
                    <div>
                      <h1 class="text-2xl font-bold text-white">{s().hostname}</h1>
                      <p class="text-sm text-slate-400">
                        {s().os_name} {s().os_version} • {s().kernel}
                      </p>
                    </div>
                  </>
                )}
              </Show>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Show
          when={!loading()}
          fallback={<div class="text-center text-slate-400 py-12">Loading...</div>}
        >
          <div class="space-y-6">
            {/* System Overview */}
            <Show when={server()}>
              {(s) => (
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div class="text-slate-400 text-sm mb-1">CPU</div>
                    <div class="text-white font-semibold text-lg truncate">{s().cpu_model}</div>
                  </div>
                  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div class="text-slate-400 text-sm mb-1">Memory</div>
                    <div class="text-white font-semibold text-lg">{formatBytes(s().mem_bytes)}</div>
                  </div>
                  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div class="text-slate-400 text-sm mb-1">Uptime</div>
                    <div class="text-white font-semibold text-lg">
                      {heartbeats().length > 0 ? formatUptime(heartbeats()[heartbeats().length - 1].uptime_s) : '-'}
                    </div>
                  </div>
                  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <div class="text-slate-400 text-sm mb-1">Agent Version</div>
                    <div class="text-white font-semibold text-lg">v{s().agent_version}</div>
                  </div>
                </div>
              )}
            </Show>

            {/* Charts */}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* CPU Chart */}
              <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h2 class="text-lg font-semibold text-white mb-4">CPU Usage (24h)</h2>
                <Show when={cpuChartData()} fallback={<div class="text-slate-500 text-sm">No data available</div>}>
                  {(data) => (
                    <div class="h-64">
                      <Line data={data()} options={chartOptions} />
                    </div>
                  )}
                </Show>
              </div>

              {/* Memory Chart */}
              <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h2 class="text-lg font-semibold text-white mb-4">Memory Usage (24h)</h2>
                <Show when={memoryChartData()} fallback={<div class="text-slate-500 text-sm">No data available</div>}>
                  {(data) => (
                    <div class="h-64">
                      <Line data={data()} options={chartOptions} />
                    </div>
                  )}
                </Show>
              </div>
            </div>

            {/* Disks */}
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 class="text-lg font-semibold text-white mb-4">Disk Usage</h2>
              <Show when={disks().length > 0} fallback={<div class="text-slate-500 text-sm">No disk data</div>}>
                <div class="space-y-4">
                  <For each={disks()}>
                    {(disk) => {
                      const usedPct = ((disk.used_bytes || 0) / (disk.size_bytes || 1)) * 100;
                      return (
                        <div>
                          <div class="flex items-center justify-between text-sm mb-2">
                            <span class="text-white font-medium">{disk.mount || '-'} ({disk.fs || '-'})</span>
                            <span class="text-slate-400">
                              {formatBytes(disk.used_bytes || 0)} / {formatBytes(disk.size_bytes || 0)} ({usedPct.toFixed(1)}%)
                            </span>
                          </div>
                          <div class="w-full bg-slate-700 rounded-full h-2">
                            <div 
                              class={`h-2 rounded-full ${usedPct > 90 ? 'bg-red-500' : usedPct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                              style={`width: ${Math.min(usedPct, 100)}%`}
                            ></div>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>

            {/* Network Interfaces */}
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 class="text-lg font-semibold text-white mb-4">Network Interfaces</h2>
              <Show when={network().length > 0} fallback={<div class="text-slate-500 text-sm">No network data</div>}>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-slate-400 border-b border-slate-700">
                        <th class="pb-2">Interface</th>
                        <th class="pb-2">MAC</th>
                        <th class="pb-2">IPv4</th>
                        <th class="pb-2">Sent</th>
                        <th class="pb-2">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={network()}>
                        {(iface) => (
                          <tr class="border-b border-slate-700/50">
                            <td class="py-2 text-white font-medium">{iface.name || '-'}</td>
                            <td class="py-2 text-slate-400 font-mono text-xs">{iface.mac || '-'}</td>
                            <td class="py-2 text-slate-400">{iface.ipv4 || '-'}</td>
                            <td class="py-2 text-slate-400">{formatBytes(iface.bytes_sent || 0)}</td>
                            <td class="py-2 text-slate-400">{formatBytes(iface.bytes_recv || 0)}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </div>

            {/* Top Processes */}
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 class="text-lg font-semibold text-white mb-4">Top Processes</h2>
              <Show when={processes().length > 0} fallback={<div class="text-slate-500 text-sm">No process data</div>}>
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-slate-400 border-b border-slate-700">
                        <th class="pb-2">PID</th>
                        <th class="pb-2">Name</th>
                        <th class="pb-2">User</th>
                        <th class="pb-2">CPU %</th>
                        <th class="pb-2">Memory %</th>
                        <th class="pb-2">Command</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={processes()}>
                        {(proc) => (
                          <tr class="border-b border-slate-700/50">
                            <td class="py-2 text-slate-400">{proc.pid || 0}</td>
                            <td class="py-2 text-white font-medium">{proc.name || '-'}</td>
                            <td class="py-2 text-slate-400">{proc.username || '-'}</td>
                            <td class="py-2 text-slate-400">{(proc.cpu_pct || 0).toFixed(1)}%</td>
                            <td class="py-2 text-slate-400">{(proc.mem_pct || 0).toFixed(1)}%</td>
                            <td class="py-2 text-slate-500 text-xs truncate max-w-xs">{proc.cmdline || '-'}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </div>

            {/* Packages */}
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 class="text-lg font-semibold text-white mb-4">Installed Packages (Top 50)</h2>
              <Show when={packages().length > 0} fallback={<div class="text-slate-500 text-sm">No package data</div>}>
                <div class="max-h-96 overflow-y-auto">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <For each={packages()}>
                      {(pkg) => (
                        <div class="text-sm text-slate-400 font-mono">
                          <span class="text-white">{pkg.name || '-'}</span> {pkg.version || '-'}
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>

            {/* Logs */}
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 class="text-lg font-semibold text-white mb-4">Recent Logs</h2>
              <Show when={logs().length > 0} fallback={<div class="text-slate-500 text-sm">No log data</div>}>
                <div class="max-h-96 overflow-y-auto space-y-2">
                  <For each={logs()}>
                    {(log) => (
                      <div class="text-xs font-mono">
                        <span class="text-slate-500">
                          {log.ts ? format(new Date(log.ts), 'MMM dd HH:mm:ss') : '-'}
                        </span>
                        {' '}
                        <span class="text-blue-400">{log.unit || '-'}</span>
                        {' '}
                        <span class="text-slate-300">{log.message || '-'}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </main>
    </div>
  );
}

