import { createSignal } from 'solid-js';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const [isSignUp, setIsSignUp] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp()) {
        const { error } = await supabase.auth.signUp({
          email: email(),
          password: password(),
        });
        if (error) throw error;
        setError('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email(),
          password: password(),
        });
        if (error) throw error;
        // Redirect handled by App.tsx
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div class="max-w-md w-full">
        {/* Logo/Title */}
        <div class="text-center mb-8">
          <h1 class="text-4xl font-bold text-white mb-2">👁️ Godseye</h1>
          <p class="text-slate-400">Fleet Monitoring System</p>
        </div>

        {/* Login Form */}
        <div class="bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
          <h2 class="text-2xl font-semibold text-white mb-6">
            {isSignUp() ? 'Create Account' : 'Sign In'}
          </h2>

          <form onSubmit={handleSubmit} class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                required
                class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                required
                minLength={6}
                class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error() && (
              <div class={`p-3 rounded-lg text-sm ${
                error().includes('email') ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'
              }`}>
                {error()}
              </div>
            )}

            <button
              type="submit"
              disabled={loading()}
              class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
            >
              {loading() ? 'Please wait...' : isSignUp() ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div class="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp());
                setError('');
              }}
              class="text-sm text-slate-400 hover:text-white transition-colors"
            >
              {isSignUp() ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>

        <div class="mt-8 text-center text-sm text-slate-500">
          <p>Open source fleet monitoring for Ubuntu servers</p>
        </div>
      </div>
    </div>
  );
}

