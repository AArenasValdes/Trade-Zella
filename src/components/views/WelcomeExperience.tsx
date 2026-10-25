'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { gsap } from 'gsap';
import grisIcon from '@/app/lib/icons/gris.png';
import { ArrowRight, SkipForward, Volume2, VolumeX } from 'lucide-react';

interface WelcomeExperienceProps {
  onAccessReady: () => void;
  onComplete: () => void;
  forceMotion?: boolean;
}

type WelcomeStep = 'story' | 'dedication' | 'access';

const SYMBOLIC_CANDLES = [
  { x: 42, open: 128, close: 100, high: 86, low: 143 },
  { x: 76, open: 105, close: 117, high: 94, low: 137 },
  { x: 110, open: 116, close: 89, high: 79, low: 128 },
  { x: 144, open: 91, close: 107, high: 84, low: 124 },
  { x: 178, open: 108, close: 121, high: 96, low: 134 },
  { x: 212, open: 118, close: 92, high: 82, low: 130 },
  { x: 246, open: 93, close: 76, high: 63, low: 110 },
  { x: 280, open: 78, close: 97, high: 70, low: 116 },
  { x: 314, open: 96, close: 109, high: 85, low: 125 },
  { x: 348, open: 108, close: 83, high: 73, low: 122 },
  { x: 382, open: 84, close: 99, high: 74, low: 114 },
  { x: 416, open: 101, close: 72, high: 61, low: 117 },
  { x: 450, open: 71, close: 88, high: 64, low: 102 },
  { x: 484, open: 89, close: 106, high: 80, low: 120 },
  { x: 518, open: 105, close: 79, high: 69, low: 124 },
  { x: 552, open: 78, close: 96, high: 71, low: 110 },
  { x: 586, open: 95, close: 112, high: 83, low: 127 },
  { x: 620, open: 110, close: 86, high: 74, low: 128 },
  { x: 654, open: 85, close: 101, high: 76, low: 115 },
  { x: 688, open: 100, close: 77, high: 66, low: 119 },
  { x: 722, open: 78, close: 92, high: 68, low: 109 },
  { x: 756, open: 91, close: 107, high: 81, low: 121 },
  { x: 790, open: 106, close: 84, high: 73, low: 127 },
  { x: 824, open: 83, close: 96, high: 71, low: 112 },
];

const DEDICATION_PARAGRAPHS = [
  'Desde marzo de 2022 tomaste un rumbo distinto. Sé que este camino no ha sido sencillo y que detrás de cada operación hay mucho más de lo que puede mostrar una gráfica.',
  'Quise crear este espacio especialmente para ti. Un lugar donde puedas guardar tus operaciones, revisar tus decisiones y, con el tiempo, mirar hacia atrás y reconocer todo lo que has recorrido.',
  'No sé qué traerá el futuro, pero sí sé que tu esfuerzo merece ser reconocido. Espero que esta pequeña herramienta te acompañe en lo que viene.',
];

export function WelcomeExperience({ onAccessReady, onComplete, forceMotion = false }: WelcomeExperienceProps) {
  const [step, setStep] = useState<WelcomeStep>('story');
  const [canContinue, setCanContinue] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const skipRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const musicStartedRef = useRef(false);

  function musicLevelAt(time: number) {
    if (time < 3) return 0.06;
    if (time < 10) return 0.06 + ((time - 3) / 7) * 0.07;
    if (time < 15) return 0.13 + ((time - 10) / 5) * 0.03;
    if (time < 20) return 0.16 + ((time - 15) / 5) * 0.06;
    if (time < 23.5) return 0.22;
    if (time < 25) return 0.22 - ((time - 23.5) / 1.5) * 0.13;
    return 0.09;
  }

  function fadeMusicOut() {
    const audio = audioRef.current;
    if (!audio) return;
    musicStartedRef.current = false;
    setMusicEnabled(false);
    if (audio.paused) {
      audio.currentTime = 0;
      audio.volume = 0.09;
      return;
    }
    gsap.killTweensOf(audio);
    gsap.to(audio, {
      volume: 0,
      duration: 0.65,
      ease: 'power2.out',
      onComplete: () => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 0.09;
      },
    });
  }

  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;

    if (musicEnabled) {
      audio.pause();
      musicStartedRef.current = false;
      setMusicEnabled(false);
      return;
    }

    if (!musicStartedRef.current) {
      const timelineTime = timelineRef.current?.time() ?? (step === 'dedication' ? 24 : 0);
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      audio.currentTime = duration > 0 ? Math.min(timelineTime, Math.max(0, duration - 0.1)) : timelineTime;
      audio.volume = musicLevelAt(timelineTime);
    }

    musicStartedRef.current = true;
    try {
      await audio.play();
      setMusicEnabled(true);
    } catch {
      musicStartedRef.current = false;
      setMusicEnabled(false);
    }
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root || step !== 'story') return;

    skipRef.current?.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches && !forceMotion;
    if (reducedMotion) {
      const frame = window.requestAnimationFrame(() => {
        setStep('dedication');
        setCanContinue(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const context = gsap.context(() => {
      const scene = (name: string) => root.querySelector(`[data-scene="${name}"]`);
      const timeline = gsap.timeline({
        defaults: { ease: 'power2.out' },
        onUpdate: () => {
          const audio = audioRef.current;
          const timelineTime = timelineRef.current?.time() ?? 0;
          if (audio && musicStartedRef.current) audio.volume = musicLevelAt(timelineTime);
        },
        onComplete: () => {
          setStep('dedication');
          setCanContinue(true);
        },
      });
      timelineRef.current = timeline;

      gsap.set('[data-scene]', { autoAlpha: 0 });
      gsap.set('[data-identity-caption]', { autoAlpha: 0, y: 8 });
      gsap.set('[data-candle]', { autoAlpha: 0, y: 5 });
      gsap.set('[data-dedication-copy], [data-dedication-signoff], [data-dedication-mark]', {
        autoAlpha: 0,
        y: 8,
      });
      gsap.set('[data-brand-logo]', { autoAlpha: 0, scale: 0.98 });
      gsap.set('[data-light-sweep]', { xPercent: -150, autoAlpha: 0 });

      timeline
        .to(scene('origin'), { autoAlpha: 1, duration: 0.8 }, 0)
        .to(scene('origin'), { autoAlpha: 0, duration: 0.45 }, 2.55)
        .to(scene('chart'), { autoAlpha: 1, duration: 0.6 }, 3)
        .to('[data-candle]', { autoAlpha: 1, y: 0, duration: 0.32, stagger: 0.25 }, 3.25)
        .to('[data-chart-art]', { x: -34, autoAlpha: 0.54, duration: 0.6 }, 9.35)
        .to(scene('chart'), { autoAlpha: 0, duration: 0.42 }, 9.9)
        .to(scene('difficulties'), { autoAlpha: 1, duration: 0.7 }, 10.2)
        .to(scene('difficulties'), { autoAlpha: 0, duration: 0.5 }, 14.45)
        .to(scene('purpose'), { autoAlpha: 1, duration: 0.75 }, 15)
        .fromTo('[data-purpose-line]', { scaleX: 0.15, autoAlpha: 0 }, { scaleX: 1, autoAlpha: 0.75, duration: 1.2 }, 15.2)
        .to('[data-purpose-line]', { autoAlpha: 0, duration: 0.5 }, 18.2)
        .to(scene('purpose'), { autoAlpha: 0, duration: 0.55 }, 18.45)
        .to(scene('identity'), { autoAlpha: 1, duration: 0.8 }, 19)
        .fromTo('[data-brand-logo]', { autoAlpha: 0, scale: 0.97 }, { autoAlpha: 1, scale: 1, duration: 1.45 }, 19.15)
        .to('[data-light-sweep]', { autoAlpha: 0.72, duration: 0.3 }, 20)
        .to('[data-light-sweep]', { xPercent: 170, duration: 1.25, ease: 'sine.inOut' }, 20.05)
        .to('[data-identity-caption]', { autoAlpha: 1, y: 0, duration: 0.6 }, 21.1)
        .to(scene('identity'), { autoAlpha: 0, duration: 0.55 }, 23.5)
        .to(scene('dedication'), { autoAlpha: 1, duration: 0.75 }, 24)
        .to('[data-dedication-mark]', { autoAlpha: 1, y: 0, duration: 0.6 }, 24.2)
        .to('[data-dedication-copy="0"]', { autoAlpha: 1, y: 0, duration: 0.7 }, 24.65)
        .to('[data-dedication-copy="1"]', { autoAlpha: 1, y: 0, duration: 0.7 }, 25.65)
        .to('[data-dedication-copy="2"]', { autoAlpha: 1, y: 0, duration: 0.7 }, 26.65)
        .to('[data-dedication-signoff]', { autoAlpha: 1, y: 0, duration: 0.6 }, 27.8)
        .to({}, { duration: 0.6 }, 28.4);
    }, root);

    return () => {
      context.revert();
    };
  }, [forceMotion, step]);

  useEffect(() => {
    document.body.classList.add('intro-scroll-lock');
    return () => document.body.classList.remove('intro-scroll-lock');
  }, []);

  useEffect(() => {
    if (step !== 'access') return;
    document.getElementById('welcome-continue')?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && step !== 'access') {
        event.preventDefault();
        handleSkipIntro();
        return;
      }
      if (event.key !== 'Tab' || !rootRef.current) return;

      const focusable = rootRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  function handleSkipIntro() {
    fadeMusicOut();
    onAccessReady();
    setStep('access');
  }

  const handleContinue = () => {
    if (!canContinue) return;
    fadeMusicOut();
    onAccessReady();
    setStep('access');
  };

  return (
    <div
      className="martin-intro fixed inset-0 z-50 overflow-y-auto bg-[#09090B] text-zinc-100 selection:bg-white/15 selection:text-white"
      data-step={step}
      ref={rootRef}
    >
      <div className="martin-intro__grain" aria-hidden="true" />
      <div className="martin-intro__grid" aria-hidden="true" />
      <audio
        aria-hidden="true"
        preload="metadata"
        ref={audioRef}
        src="/audio/leberch-riser-riser-music-590428.mp3"
        onLoadedMetadata={(event) => {
          if (!musicStartedRef.current) event.currentTarget.volume = 0.09;
        }}
        onEnded={() => {
          musicStartedRef.current = false;
          setMusicEnabled(false);
        }}
        onError={() => {
          musicStartedRef.current = false;
          setMusicEnabled(false);
        }}
      />

      <section
        aria-label={step === 'access' ? 'Acceso a MARTIN OS' : 'Introductorio para Martín'}
        aria-modal="true"
        className="martin-intro__stage"
        role="dialog"
      >
        <div className="martin-intro__skip-row">
          {step !== 'access' && (
            <button
              aria-label={musicEnabled ? 'Desactivar música' : 'Activar música'}
              aria-pressed={musicEnabled}
              className="martin-intro__music"
              onClick={() => void toggleMusic()}
              type="button"
            >
              {musicEnabled ? (
                <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <VolumeX aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {musicEnabled ? 'Música activada' : 'Activar música'}
            </button>
          )}
          {step !== 'access' && (
            <button
              className="martin-intro__skip"
              onClick={handleSkipIntro}
              ref={skipRef}
              type="button"
            >
              <SkipForward aria-hidden="true" className="h-3.5 w-3.5" />
              Saltar intro
            </button>
          )}
        </div>

        <div className="martin-intro__story" aria-hidden={step !== 'dedication'}>
          <div className="martin-intro__scene martin-intro__origin" data-scene="origin">
            <p className="martin-intro__eyebrow">UN RECORRIDO PERSONAL</p>
            <h1>Marzo de 2022</h1>
          </div>

          <div className="martin-intro__scene martin-intro__chart-scene" data-scene="chart">
            <div className="martin-intro__chart" data-chart-art>
              <svg
                aria-hidden="true"
                className="martin-intro__candles"
                fill="none"
                viewBox="0 0 880 220"
              >
                <path d="M20 178H860M20 110H860M20 42H860" />
                {SYMBOLIC_CANDLES.map((candle, index) => {
                  const rising = candle.close < candle.open;
                  const top = Math.min(candle.open, candle.close);
                  const height = Math.max(8, Math.abs(candle.close - candle.open));
                  return (
                    <g data-candle key={candle.x}>
                      <line
                        className="martin-intro__wick"
                        x1={candle.x + 7}
                        x2={candle.x + 7}
                        y1={candle.high}
                        y2={candle.low}
                      />
                      <rect
                        className={rising ? 'martin-intro__candle--white' : 'martin-intro__candle--black'}
                        height={height}
                        width="14"
                        x={candle.x}
                        y={top}
                      />
                      {index === 0 && <title>Velas simbólicas, sin datos de operaciones</title>}
                    </g>
                  );
                })}
              </svg>
              <span className="martin-intro__chart-note">VELAS SIMBÓLICAS · SIN DATOS FINANCIEROS</span>
            </div>
          </div>

          <div className="martin-intro__scene martin-intro__phrase" data-scene="difficulties">
            <p>Hay cosas que una gráfica no muestra</p>
          </div>

          <div className="martin-intro__scene martin-intro__purpose" data-scene="purpose">
            <span className="martin-intro__purpose-line" data-purpose-line />
            <p>Un lugar para registrar tu propio camino</p>
          </div>

          <div className="martin-intro__scene martin-intro__identity" data-scene="identity">
            <div className="martin-intro__brand-logo" data-brand-logo>
              <Image
                alt=""
                className="h-full w-full object-contain"
                priority
                sizes="(max-width: 640px) 42vw, 250px"
                src={grisIcon}
              />
              <span className="martin-intro__light-sweep" data-light-sweep />
            </div>
            <p className="martin-intro__wordmark" data-identity-caption>
              MARTIN <span>{'//'}</span> OS
            </p>
            <p className="martin-intro__identity-dedication" data-identity-caption>
              Para ti, Martín <span>·</span> Alessandro
            </p>
          </div>

          <div className="martin-intro__scene martin-intro__dedication" data-scene="dedication">
            <div className="martin-intro__dedication-mark" data-dedication-mark>
              <Image alt="" className="h-full w-full object-contain" sizes="64px" src={grisIcon} />
            </div>
            <p className="martin-intro__eyebrow">PARA TI, MARTÍN</p>
            <div className="martin-intro__letter">
              {DEDICATION_PARAGRAPHS.map((paragraph, index) => (
                <p data-dedication-copy={index} key={paragraph}>
                  {paragraph}
                </p>
              ))}
              <p className="martin-intro__signoff" data-dedication-signoff>
                <strong>Con cariño,</strong>
                <strong>Alessandro</strong>
              </p>
            </div>
            <div className="martin-intro__dedication-actions">
              {canContinue ? (
                <button className="martin-intro__continue" onClick={handleContinue} type="button">
                  Continuar
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
              ) : (
                <span className="martin-intro__reading-cue">Un momento para leer</span>
              )}
            </div>
          </div>
        </div>

        {step === 'access' && (
          <div className="martin-intro__access">
            <div className="martin-intro__access-mark">
              <Image alt="" className="h-full w-full object-contain" sizes="64px" src={grisIcon} />
            </div>
            <p className="martin-intro__wordmark">
              MARTIN <span>{'//'}</span> OS
            </p>
            <h1>Tu bitácora ya está lista</h1>
            <p className="martin-intro__access-subtitle">Tu sesión está protegida. Tus operaciones quedan en tu cuenta.</p>
            <button className="martin-intro__login" id="welcome-continue" onClick={onComplete} type="button">
              Entrar a la bitácora
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              className="martin-intro__replay"
              onClick={() => {
                setCanContinue(false);
                setStep('story');
              }}
              type="button"
            >
              Reproducir intro
            </button>
          </div>
        )}

        <p className="sr-only" aria-live="polite">
          {step === 'story' && 'Marzo de 2022. Comienza un recorrido personal, representado por velas simbólicas.'}
          {step === 'dedication' && 'Dedicatoria para Martín.'}
          {step === 'access' && 'Acceso a MARTIN OS.'}
        </p>
      </section>
    </div>
  );
}
