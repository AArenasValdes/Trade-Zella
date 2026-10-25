'use client';

import Image from 'next/image';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { ArrowRight, LoaderCircle, ShieldCheck } from 'lucide-react';
import grisIcon from '@/app/lib/icons/gris.png';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseConfig } from '@/lib/supabase/config';

type AuthMode = 'sign-in' | 'sign-up';

interface SupabaseAuthGateProps {
  children: (user: User) => ReactNode;
}

export function SupabaseAuthGate({ children }: SupabaseAuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(() => !hasSupabaseConfig());
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const configured = hasSupabaseConfig();

  useEffect(() => {
    if (!configured) return;

    const supabase = createClient();
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((
      _event: AuthChangeEvent,
      session: Session | null,
    ) => {
      if (active) setUser(session?.user ?? null);
    });

    void supabase.auth.getUser().then((result: Awaited<ReturnType<typeof supabase.auth.getUser>>) => {
      if (!active) return;
      if (result.error && result.error.name !== 'AuthSessionMissingError') {
        setError('No pudimos validar la sesión. Vuelve a iniciar sesión.');
      }
      setUser(result.data.user);
      setIsReady(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [configured]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage('Revisa tu correo para confirmar la cuenta y luego inicia sesión.');
        } else {
          setUser(data.user);
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        setUser(data.user);
      }
    } catch (cause) {
      const description = cause instanceof Error ? cause.message : '';
      setError(
        description.includes('Invalid login credentials')
          ? 'Correo o clave incorrectos.'
          : description.includes('already registered')
            ? 'Ese correo ya tiene una cuenta. Inicia sesión.'
            : 'No se pudo completar el acceso. Revisa los datos e inténtalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!configured) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#09090B] px-5 text-zinc-100">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-7 shadow-2xl sm:p-9">
          <div className="mx-auto mb-5 h-16 w-16">
            <Image src={grisIcon} alt="" className="h-full w-full object-contain" priority />
          </div>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">MARTIN // TRADER</p>
          <h1 className="mt-3 text-center text-2xl font-semibold">Conecta tu proyecto de Supabase</h1>
          <p className="mt-3 text-center text-sm leading-6 text-zinc-400">
            El acceso queda cerrado hasta configurar la URL y la clave pública del proyecto. Así la bitácora no se publica abierta por accidente.
          </p>
          <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-6 text-zinc-300">
            <p>NEXT_PUBLIC_SUPABASE_URL=</p>
            <p>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=</p>
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">
            Copia estas variables en <code>.env.local</code> y en los ajustes de Vercel. Nunca uses aquí una clave <code>service_role</code>.
          </p>
        </section>
      </main>
    );
  }

  if (!isReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#09090B] text-zinc-400">
        <LoaderCircle className="h-6 w-6 animate-spin" aria-label="Validando sesión" />
      </main>
    );
  }

  if (user) return children(user);

  return (
    <main className="grid min-h-screen place-items-center bg-[#09090B] px-5 py-10 text-zinc-100">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-7 shadow-2xl sm:p-9">
        <div className="mx-auto mb-4 h-16 w-16">
          <Image src={grisIcon} alt="" className="h-full w-full object-contain" priority />
        </div>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">MARTIN // TRADER</p>
        <h1 className="mt-3 text-center text-2xl font-semibold">
          {mode === 'sign-in' ? 'Tu bitácora te espera' : 'Crear cuenta'}
        </h1>
        <p className="mt-2 text-center text-sm text-zinc-400">Una sesión a la vez. Un paso a la vez.</p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          {mode === 'sign-up' && (
            <label className="block text-sm text-zinc-300">
              Nombre
              <input
                autoComplete="name"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-zinc-100 outline-none focus:border-cyan-400/60"
                maxLength={80}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
          )}
          <label className="block text-sm text-zinc-300">
            Correo
            <input
              autoComplete="email"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-zinc-100 outline-none focus:border-cyan-400/60"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Clave
            <input
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-zinc-100 outline-none focus:border-cyan-400/60"
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}

          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {mode === 'sign-in' ? 'Entrar a la bitácora' : 'Crear cuenta segura'}
          </button>
        </form>

        <button
          className="mx-auto mt-5 flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white"
          onClick={() => {
            setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in');
            setError('');
            setMessage('');
          }}
          type="button"
        >
          {mode === 'sign-in' ? '¿Primera vez? Crear cuenta' : 'Ya tengo cuenta'}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <p className="mt-6 text-center text-xs leading-5 text-zinc-500">
          Tus registros se guardarán en tu cuenta y la base de datos aplica aislamiento por usuario.
        </p>
      </section>
    </main>
  );
}

export async function signOutFromSupabase() {
  const { error: signOutError } = await createClient().auth.signOut();
  if (signOutError) throw signOutError;
}
