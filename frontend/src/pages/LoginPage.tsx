import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { getAuthConfig, loginWithPassword, loginWithGoogle } from '../lib/services';
import { Spinner } from '../components/ui/Spinner';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const { data: config } = useQuery({
    queryKey: ['auth-config'],
    queryFn: getAuthConfig,
    staleTime: Infinity,
  });

  // Already logged in → go home.
  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/home', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  // Render Google Identity Services button when config + script are ready.
  useEffect(() => {
    const clientId = config?.google_client_id;
    if (!clientId || !window.google || !googleBtnRef.current) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: { credential: string }) => {
        try {
          const res = await loginWithGoogle(response.credential);
          login(res.token, res.user);
          navigate('/home', { replace: true });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Error con Google');
        }
      },
    });

    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'filled_black',
      size: 'large',
      width: 320,
      text: 'signin_with',
      shape: 'rectangular',
    });
  }, [config, login, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      const res = await loginWithPassword(email, password);
      login(res.token, res.user);
      navigate('/home', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Credenciales incorrectas');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-netflix-bg">
        <Spinner className="h-10 w-10" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-netflix-bg px-4">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(20,20,20,0.7), rgba(20,20,20,0.95)), url('https://image.tmdb.org/t/p/original/wwemzKWzjKYJFfCeiB57q3r4Bcm.svg')",
        }}
      />
      <div className="relative w-full max-w-md rounded-lg border border-netflix-border bg-black/75 p-8 backdrop-blur">
        <h1 className="mb-1 text-center text-4xl font-black tracking-tight text-netflix-red">
          LUPEFLIX
        </h1>
        <p className="mb-8 text-center text-sm text-netflix-muted">
          Tu biblioteca personal de cine y series
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electrónico"
            className="w-full rounded border border-netflix-border bg-netflix-surface px-4 py-3 text-white placeholder:text-netflix-muted focus:border-netflix-red focus:outline-none"
            required
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="w-full rounded border border-netflix-border bg-netflix-surface px-4 py-3 text-white placeholder:text-netflix-muted focus:border-netflix-red focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center rounded bg-netflix-red px-4 py-3 font-bold text-white transition-colors hover:bg-netflix-red2 disabled:opacity-60"
          >
            {submitting ? <Spinner className="h-5 w-5" /> : 'Iniciar sesión'}
          </button>
        </form>

        {config?.google_client_id && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-netflix-muted">
              <span className="h-px flex-1 bg-netflix-border" />o<span className="h-px flex-1 bg-netflix-border" />
            </div>
            <div className="flex justify-center" ref={googleBtnRef} />
          </>
        )}
      </div>
    </div>
  );
}
