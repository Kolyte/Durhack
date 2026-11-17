import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../api/http';
import { compact, renderShareCard } from './shareCard';
import { Soundtrack } from './soundtrack';
import type { Wrapped } from './types';

const SLIDE_MS = 6500;
const YEAR = new Date().getFullYear();

type Phase = { kind: 'ask' } | { kind: 'loading'; login: string } | { kind: 'error'; message: string } | { kind: 'ready'; data: Wrapped } | { kind: 'story'; data: Wrapped };

/** Sonyx Wrapped: a GitHub profile's year as a short, swipeable music story with a shareable card. */
export function WrappedPage() {
  const initial = new URLSearchParams(window.location.search).get('u');
  const [phase, setPhase] = useState<Phase>(initial ? { kind: 'loading', login: initial } : { kind: 'ask' });
  const [me, setMe] = useState<string | null>(null);

  const fetchWrapped = useCallback(async (clean: string) => {
    try {
      const res = await apiFetch(`/api/wrapped/${encodeURIComponent(clean)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { message?: string }).message ?? 'Something went wrong');
      setPhase({ kind: 'ready', data: body as Wrapped });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Something went wrong' });
    }
  }, []);

  const load = useCallback(
    (login: string) => {
      const clean = login.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//, '').split('/')[0];
      if (!clean) return;
      setPhase({ kind: 'loading', login: clean });
      const url = new URL(window.location.href);
      url.searchParams.set('u', clean);
      window.history.replaceState(null, '', url);
      void fetchWrapped(clean);
    },
    [fetchWrapped],
  );

  useEffect(() => {
    if (initial) void fetchWrapped(initial);
    void apiFetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { signedIn?: boolean; login?: string } | null) => setMe(m?.signedIn && m.login ? m.login : null))
      .catch(() => undefined);
  }, [initial, fetchWrapped]);

  return (
    <div className="wrapped">
      <div className="wrapped__blobs" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      {phase.kind === 'ask' && <Ask me={me} onGo={load} />}
      {phase.kind === 'loading' && (
        <div className="wrapped__center">
          <div className="eq" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />
            ))}
          </div>
          <p>Listening to @{phase.login}'s repositories…</p>
        </div>
      )}
      {phase.kind === 'error' && (
        <div className="wrapped__center">
          <h1>Hmm.</h1>
          <p>{phase.message}</p>
          <button className="btn btn--primary" onClick={() => setPhase({ kind: 'ask' })}>
            Try another username
          </button>
        </div>
      )}
      {phase.kind === 'ready' && <Start data={phase.data} onStart={() => setPhase({ kind: 'story', data: phase.data })} />}
      {phase.kind === 'story' && <Story data={phase.data} onRestart={() => setPhase({ kind: 'ask' })} />}
    </div>
  );
}

function Ask({ me, onGo }: { me: string | null; onGo: (login: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="wrapped__center wrapped__ask">
      <a className="wrapped__brand" href="/">
        ◈ Sonyx
      </a>
      <h1>
        Wrapped <span className="hero__accent">{YEAR}</span>
      </h1>
      <p>Your GitHub year, as music. Top languages become genres, your biggest repo becomes your hit single.</p>
      <form
        className="repo-form"
        onSubmit={(e) => {
          e.preventDefault();
          onGo(value);
        }}
      >
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="GitHub username" aria-label="GitHub username" spellCheck={false} autoCapitalize="none" />
        <button className="btn btn--primary" type="submit" disabled={!value.trim()}>
          Wrap it
        </button>
      </form>
      {me && (
        <button className="btn btn--accent" onClick={() => onGo(me)}>
          ✨ Wrap my profile (@{me})
        </button>
      )}
      <p className="note">Uses public GitHub data only.</p>
    </div>
  );
}

function Start({ data, onStart }: { data: Wrapped; onStart: () => void }) {
  return (
    <div className="wrapped__center">
      {data.avatarUrl && <img className="wrapped__avatar" src={data.avatarUrl} alt="" />}
      <h1>{data.name || data.login}</h1>
      <p>Your {data.year} Wrapped is ready. Turn your sound on.</p>
      <button className="btn btn--primary wrapped__play" onClick={onStart}>
        ▶ Play my Wrapped
      </button>
    </div>
  );
}

/** Animated number that counts up when its slide appears. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{compact(shown)}</>;
}

function Story({ data, onRestart }: { data: Wrapped; onRestart: () => void }) {
  const slides = useMemo(() => buildSlides(data, onRestart), [data, onRestart]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const music = useRef<Soundtrack | null>(null);
  const last = index === slides.length - 1;

  useEffect(() => {
    const s = new Soundtrack();
    music.current = s;
    void s.start(data.key, data.bpm).catch(() => undefined);
    return () => s.stop();
  }, [data]);
  useEffect(() => music.current?.next(index), [index]);
  useEffect(() => music.current?.setMuted(muted), [muted]);

  useEffect(() => {
    if (paused || last) return;
    const id = window.setTimeout(() => setIndex((i) => Math.min(slides.length - 1, i + 1)), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, last, slides.length]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setIndex((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [slides.length]);

  const slide = slides[index];
  return (
    <div className={`story story--${slide.theme}`}>
      <div className="story__bars" aria-hidden>
        {slides.map((s, i) => (
          <span key={s.id} className="story__bar">
            <i className={i < index ? 'is-done' : i === index && !last ? (paused ? 'is-paused' : 'is-running') : i === index ? 'is-done' : ''} style={{ animationDuration: `${SLIDE_MS}ms` }} />
          </span>
        ))}
      </div>
      <div className="story__top">
        <span className="story__who">
          {data.avatarUrl && <img src={data.avatarUrl} alt="" />}@{data.login}
        </span>
        <button className="btn btn--icon" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Tap left/right thirds to go back/forward; hold to pause (like stories on social apps). */}
      {!last && (
        <>
          <button className="story__nav story__nav--prev" aria-label="Previous" onClick={() => setIndex((i) => Math.max(0, i - 1))} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)} />
          <button className="story__nav story__nav--next" aria-label="Next" onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)} />
        </>
      )}

      <section key={slide.id} className="story__slide">
        {slide.body}
      </section>
      {last && index > 0 && (
        <button className="story__back link" onClick={() => setIndex(0)}>
          ↺ Replay
        </button>
      )}
    </div>
  );
}

interface Slide {
  id: string;
  theme: 'teal' | 'violet' | 'pink' | 'sunset' | 'ocean' | 'night';
  body: React.ReactNode;
}

function buildSlides(w: Wrapped, onRestart: () => void): Slide[] {
  const slides: Slide[] = [
    {
      id: 'intro',
      theme: 'night',
      body: (
        <>
          <p className="story__kicker">Sonyx Wrapped {w.year}</p>
          <h2 className="story__huge">
            {w.name?.split(' ')[0] || w.login}, this was your year in sound.
          </h2>
          <p className="story__sub">
            Recorded at <b>{w.bpm} BPM</b> in <b>{w.key}</b>.
          </p>
        </>
      ),
    },
    {
      id: 'numbers',
      theme: 'teal',
      body: (
        <>
          <p className="story__kicker">Your discography</p>
          <div className="story__stats">
            <div>
              <b>
                <CountUp value={w.repos} />
              </b>
              <span>repositories</span>
            </div>
            <div>
              <b>
                <CountUp value={w.stars} />
              </b>
              <span>stars earned</span>
            </div>
            <div>
              <b>
                <CountUp value={w.linesEstimate} />
              </b>
              <span>lines of code (approx.)</span>
            </div>
            <div>
              <b>
                <CountUp value={w.followers} />
              </b>
              <span>followers</span>
            </div>
          </div>
        </>
      ),
    },
  ];
  if (w.languages.length) {
    slides.push({
      id: 'languages',
      theme: 'violet',
      body: (
        <>
          <p className="story__kicker">Your top languages, as genres</p>
          <ol className="story__langs">
            {w.languages.map((l, i) => (
              <li key={l.name} style={{ animationDelay: `${0.15 + i * 0.18}s` }}>
                <span className="story__rank">{i + 1}</span>
                <span className="story__lang">
                  <b>{l.name}</b>
                  <em>{l.genre}</em>
                </span>
                <span className="story__share">
                  <i style={{ width: `${Math.max(6, l.share)}%`, animationDelay: `${0.3 + i * 0.18}s` }} />
                </span>
                <span className="story__pct">{l.share}%</span>
              </li>
            ))}
          </ol>
        </>
      ),
    });
  }
  slides.push({
    id: 'genre',
    theme: 'pink',
    body: (
      <>
        <p className="story__kicker">Your code sounds like</p>
        <h2 className="story__genre">{w.genre}</h2>
        <p className="story__sub">
          Signature sound: <b>{w.instrument}</b>
        </p>
      </>
    ),
  });
  if (w.topRepo) {
    slides.push({
      id: 'hit',
      theme: 'sunset',
      body: (
        <>
          <p className="story__kicker">Your biggest hit</p>
          <div className="story__record" aria-hidden>
            <span />
          </div>
          <h2 className="story__big">{w.topRepo.name}</h2>
          <p className="story__sub">
            ★ {compact(w.topRepo.stars)} {w.topRepo.language && `· ${w.topRepo.language}`}
          </p>
          {w.topRepo.description && <p className="story__desc">{w.topRepo.description}</p>}
        </>
      ),
    });
  }
  slides.push({
    id: 'year',
    theme: 'ocean',
    body: (
      <>
        <p className="story__kicker">On tour in {w.year}</p>
        <h2 className="story__big">
          {w.activeThisYear} {w.activeThisYear === 1 ? 'repo' : 'repos'} played live
        </h2>
        <p className="story__sub">
          {w.newThisYear > 0 ? `${w.newThisYear} new ${w.newThisYear === 1 ? 'release' : 'releases'}. ` : ''}
          {w.busiestMonth ? `${w.busiestMonth} was your loudest month.` : 'A quiet year in the studio. The next album is coming.'}
        </p>
        {w.memberYears > 0 && <p className="story__desc">Making music on GitHub for {w.memberYears} {w.memberYears === 1 ? 'year' : 'years'}.</p>}
      </>
    ),
  });
  slides.push({
    id: 'persona',
    theme: 'violet',
    body: (
      <>
        <p className="story__kicker">You are</p>
        <h2 className="story__genre">{w.persona.title}</h2>
        <p className="story__sub">{w.persona.line}</p>
      </>
    ),
  });
  slides.push({ id: 'share', theme: 'night', body: <ShareSlide w={w} onRestart={onRestart} /> });
  return slides;
}

function ShareSlide({ w, onRestart }: { w: Wrapped; onRestart: () => void }) {
  const [status, setStatus] = useState('');
  const link = `${location.origin}/wrapped.html?u=${encodeURIComponent(w.login)}`;
  const listen = w.topRepo ? `/?repo=${encodeURIComponent(w.topRepo.fullName)}&preset=${encodeURIComponent(w.preset)}` : '/';

  const download = async () => {
    const blob = await renderShareCard(w);
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sonyx-wrapped-${w.login}-${w.year}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    const text = `My code sounds like ${w.genre} 🎧 (${w.persona.title}). What does yours sound like?`;
    try {
      const blob = await renderShareCard(w);
      const file = blob ? new File([blob], `sonyx-wrapped-${w.login}.png`, { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, url: link });
        return;
      }
      if (navigator.share) {
        await navigator.share({ text, url: link });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${link}`);
      setStatus('Link copied');
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="share">
      <div className="share__card">
        <div className="share__head">
          {w.avatarUrl && <img src={w.avatarUrl} alt="" />}
          <div>
            <strong>{w.name || w.login}</strong>
            <span>
              @{w.login} · Wrapped {w.year}
            </span>
          </div>
        </div>
        <p className="share__label">My code sounds like</p>
        <p className="share__genre">{w.genre}</p>
        <p className="share__persona">
          {w.persona.title} · {w.bpm} BPM · {w.key}
        </p>
        <div className="share__stats">
          <span>
            <b>{compact(w.repos)}</b> repos
          </span>
          <span>
            <b>{compact(w.stars)}</b> stars
          </span>
          <span>
            <b>{w.score}</b> score
          </span>
        </div>
        <p className="share__langs">{w.languages.slice(0, 3).map((l) => l.name).join(' · ')}</p>
      </div>
      <div className="share__actions">
        <button className="btn btn--primary" onClick={() => void share()}>
          Share
        </button>
        <button className="btn btn--ghost" onClick={() => void download()}>
          ⬇ Download image
        </button>
        <a className="btn btn--accent" href={listen}>
          🎧 Hear {w.topRepo ? w.topRepo.name : 'your code'} in Sonyx
        </a>
        <button className="btn btn--ghost" onClick={onRestart}>
          Wrap someone else
        </button>
      </div>
      {status && <p className="note">{status}</p>}
    </div>
  );
}
