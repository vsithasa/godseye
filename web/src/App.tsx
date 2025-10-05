import { createSignal, createEffect, Show } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import { supabase } from './lib/supabase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ServerDetail from './pages/ServerDetail';

function App() {
  const [session, setSession] = createSignal<any>(null);
  const [loading, setLoading] = createSignal(true);

  createEffect(async () => {
    // Get initial session
    const { data: { session: initialSession } } = await supabase.auth.getSession();
    setSession(initialSession);
    setLoading(false);

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  });

  return (
    <Show
      when={!loading()}
      fallback={
        <div class="min-h-screen bg-slate-900 flex items-center justify-center">
          <div class="text-white text-xl">Loading...</div>
        </div>
      }
    >
      <Show
        when={session()}
        fallback={<Login />}
      >
        <Router>
          <Route path="/" component={Dashboard} />
          <Route path="/server/:id" component={ServerDetail} />
        </Router>
      </Show>
    </Show>
  );
}

export default App;
