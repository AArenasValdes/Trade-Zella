'use client';

import { useState, useSyncExternalStore } from 'react';
import { WelcomeExperience } from '@/components/views/WelcomeExperience';

const subscribeToMotionPreference = (onChange: () => void) => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const getMotionPreference = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function IntroPreview() {
  const [instance, setInstance] = useState(0);
  const [previewMode, setPreviewMode] = useState<'choice' | 'reduced' | 'full' | null>(null);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    getMotionPreference,
    () => false,
  );

  if (prefersReducedMotion && previewMode === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#09090B] px-6 text-zinc-100">
        <section className="w-full max-w-md text-center">
          <p className="font-mono text-[10px] tracking-[0.24em] text-zinc-500">MARTIN // OS</p>
          <h1 className="mt-5 text-2xl font-light">Movimiento reducido está activo</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Para esta presentación puedes reproducir la secuencia completa o verla sin animaciones.
          </p>
          <button
            className="mt-7 min-h-11 bg-zinc-100 px-5 text-sm font-semibold text-zinc-950"
            onClick={() => setPreviewMode('full')}
            type="button"
          >
            Reproducir intro animada
          </button>
          <button
            className="mx-auto mt-3 block min-h-11 px-4 text-sm text-zinc-400 underline underline-offset-4"
            onClick={() => setPreviewMode('reduced')}
            type="button"
          >
            Ver versión reducida
          </button>
        </section>
      </main>
    );
  }

  return (
    <WelcomeExperience
      key={instance}
      forceMotion={previewMode === 'full'}
      onAccessReady={() => {}}
      onComplete={() => setInstance((current) => current + 1)}
    />
  );
}
