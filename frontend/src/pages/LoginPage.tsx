import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { getAuthConfig, loginWithPassword, loginWithGoogle, registerWithPassword } from '../lib/services';
import { Spinner } from '../components/ui/Spinner';

type Mode = 'login' | 'register';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const { data: config } = useQuery({
    queryKey: ['auth-config'],
    queryFn: getAuthConfig,
    staleTime: Infinity,
  });

  useEffect(() => {
    const verified = searchParams.get('verified');
    if (verified === '1') toast.success('Correo verificado. Ya puedes iniciar sesión.');
    if (verified === 'invalid') toast.error('El enlace de verificación no es válido o ya fue usado.');
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/home', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    const clientId = config?.google_client_id;
    if (!clientId || !window.google || !googleBtnRef.current) return;

    googleBtnRef.current.innerHTML = '';
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
      width: 360,
      text: 'signin_with',
      shape: 'pill',
    });
  }, [config, login, navigate, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (mode === 'register' && !name)) return;
    setSubmitting(true);
    try {
      if (mode === 'register') {
        const res = await registerWithPassword(name, email, password);
        if (!res.verification_required && res.token && res.user) {
          // SMTP not configured: account created and verified immediately.
          toast.success('Cuenta creada. ¡Bienvenido/a!');
          login(res.token, res.user);
          navigate('/home', { replace: true });
        } else {
          toast.success(res.email_sent
            ? 'Te hemos enviado un correo de verificación. Revisa tu bandeja de entrada.'
            : 'Verifica el enlace de verificación en los logs del servidor.');
          setMode('login');
          setPassword('');
        }
        return;
      }

      const res = await loginWithPassword(email, password);
      login(res.token, res.user);
      navigate('/home', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar la operación');
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
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-55"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.9)), url('https://image.tmdb.org/t/p/original/9n2tJBplPbgR2ca05hS5CKXwP2c.jpg')",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(229,9,20,0.15),transparent_35%)]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-12">
        <div className="text-3xl font-black tracking-tight text-netflix-red sm:text-4xl">LUPEFLIX</div>
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="rounded bg-netflix-red px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-netflix-red2"
        >
          {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
        </button>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-92px)] items-center justify-center px-4 pb-12">
        <section className="w-full max-w-md rounded-md bg-black/80 p-8 shadow-2xl backdrop-blur sm:p-10">
          <h1 className="mb-2 text-3xl font-black">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h1>
          <p className="mb-6 text-sm text-netflix-muted">
            {mode === 'login'
              ? 'Accede a tu biblioteca personal.'
              : 'Crea tu cuenta y verifica tu correo para empezar.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre"
                className="w-full rounded border border-transparent bg-[#333] px-4 py-3.5 text-white placeholder:text-[#8c8c8c] focus:border-white focus:outline-none"
                required
              />
            )}
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo electrónico"
              className="w-full rounded border border-transparent bg-[#333] px-4 py-3.5 text-white placeholder:text-[#8c8c8c] focus:border-white focus:outline-none"
              required
            />
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              className="w-full rounded border border-transparent bg-[#333] px-4 py-3.5 text-white placeholder:text-[#8c8c8c] focus:border-white focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex w-full items-center justify-center rounded bg-netflix-red px-4 py-3.5 text-base font-bold text-white transition-colors hover:bg-netflix-red2 disabled:opacity-60"
            >
              {submitting ? <Spinner className="h-5 w-5" /> : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </form>

          {config?.google_client_id && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-netflix-muted">
                <span className="h-px flex-1 bg-white/20" />o<span className="h-px flex-1 bg-white/20" />
              </div>
              <div className="flex justify-center" ref={googleBtnRef} />
            </>
          )}

          <p className="mt-8 text-sm text-netflix-muted">
            {mode === 'login' ? '¿Primera vez en LupeFlix?' : '¿Ya tienes cuenta?'}{' '}
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="font-semibold text-white hover:underline"
            >
              {mode === 'login' ? 'Crea una cuenta.' : 'Inicia sesión.'}
            </button>
          </p>
        </section>
      </main>
    </div>
  );
}
