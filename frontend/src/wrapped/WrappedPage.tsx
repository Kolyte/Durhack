import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Github, Headphones, Pause, Play, RotateCcw, Share2, Star, Volume2, VolumeX, X } from 'lucide-react';
import { apiFetch } from '../api/http';
import { SiteHeader } from '../components/SiteHeader';
import { compact, renderShareCard } from './shareCard';
import { Soundtrack } from './soundtrack';
import type { Wrapped } from './types';

const SLIDE_MS = 6500;
const YEAR = new Date().getFullYear();

type Phase = { kind: 'ask' } | { kind: 'loading'; login: string } | { kind: 'error'; message: string } | { kind: 'ready'; data: Wrapped } | { kind: 'story'; data: Wrapped };

/** Sonyx Wrapped: a GitHub profile's year as a short music story with a shareable card. */
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

  const restart = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('u');
    window.history.replaceState(null, '', url);
    setPhase({ kind: 'ask' });
  }, []);

  useEffect(() => {
    if (initial) void fetchWrapped(initial);
    void apiFetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { signedIn?: boolean; login?: string } | null) => setMe(m?.signedIn && m.login ? m.login : null))
      .catch(() => undefined);
  }, [initial, fetchWrapped]);

  if (phase.kind === 'story') return <Story data={phase.data} onRestart={restart} />;

  return (
    <div className="wrapped">
      <SiteHeader active="wrapped" />
      <main className="wrapped__main">
        {phase.kind === 'ask' && <Ask me={me} onGo={load} />}
        {phase.kind === 'loading' && (
          <div className="wrapped__center">
            <div className="eq" aria-hidden>
              {Array.from({ length: 7 }, (_, i) => (
                <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />
              ))}
            </div>
            <p>Reading @{phase.login}'s public repositories…</p>
          </div>
        )}
        {phase.kind === 'error' && (
          <div className="wrapped__center">
            <h1>That didn't work.</h1>
            <p>{phase.message}</p>
            <button className="btn btn--primary" onClick={restart}>
              Try another username
            </button>
          </div>
        )}
        {phase.kind === 'ready' && <Start data={phase.data} onStart={() => setPhase({ kind: 'story', data: phase.data })} onBack={restart} />}
      </main>
    </div>
  );
}

const WHAT_YOU_GET = [
  ['Your genre', 'Top languages become music genres.'],
  ['Your biggest hit', 'Your most-starred repository.'],
  ['Your year on tour', 'Repos you worked on, and your busiest month.'],
  ['A soundtrack', 'Generated in your own key and tempo.'],
] as const;

function Ask({ me, onGo }: { me: string | null; onGo: (login: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="wrapped__ask">
      <section className="wrapped__intro">
        <p className="eyebrow">Sonyx Wrapped {YEAR}</p>
        <h1>Your GitHub year, told as music.</h1>
        <p className="wrapped__lead">A one-minute story about your code: what it sounds like, your biggest hit, and how your year went. Then a card to share.</p>
        <form
          className="landing__search"
          onSubmit={(e) => {
            e.preventDefault();
            onGo(value);
          }}
        >
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="GitHub username" aria-label="GitHub username" spellCheck={false} autoCapitalize="none" />
          <button className="btn btn--primary" type="submit" disabled={!value.trim()}>
            <Play size={16} /> Start
          </button>
        </form>
        {me && (
          <button className="btn btn--ghost" onClick={() => onGo(me)}>
            <Github size={16} /> Use my profile (@{me})
          </button>
        )}
        <ul className="wrapped__list">
          {WHAT_YOU_GET.map(([t, d]) => (
            <li key={t}>
              <strong>{t}</strong>
              <span>{d}</span>
            </li>
          ))}
        </ul>
        <p className="note">Uses public GitHub data only. Nothing is stored.</p>
      </section>
      <aside className="wrapped__preview" aria-hidden>
        <div className="share__card">
          <div className="share__head">
            <span className="wrapped__preview-avatar" />
            <div>
              <strong>Your name</strong>
              <span>@you · Wrapped {YEAR}</span>
            </div>
          </div>
          <p className="share__label">My code sounds like</p>
          <p className="share__genre">Synthwave</p>
          <p className="share__persona">The Builder · 112 BPM · A minor</p>
          <div className="share__stats">
            <span>
              <b>38</b> repos
            </span>
            <span>
              <b>1.2K</b> stars
            </span>
            <span>
              <b>64</b> score
            </span>
          </div>
          <p className="share__langs">TypeScript · Go · Python</p>
        </div>
      </aside>
    </div>
  );
}

function Start({ data, onStart, onBack }: { data: Wrapped; onStart: () => void; onBack: () => void }) {
  return (
    <div className="wrapped__center">
      {data.avatarUrl && <img className="wrapped__avatar" src={data.avatarUrl} alt="" />}
      <h1>{data.name || data.login}</h1>
      <p>Your {data.year} Wrapped is ready. It has sound, so turn your volume up.</p>
      <div className="wrapped__actions">
        <button className="btn btn--primary wrapped__play" onClick={onStart}>
          <Play size={18} /> Play
        </button>
        <button className="btn btn--ghost" onClick={onBack}>
          Someone else
        </button>
      </div>
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

/**
 * The story player. Phones: full screen, tap the sides to move, hold to pause. Larger screens: the story
 * plays in a phone-shaped frame in the middle, with arrows beside it and keyboard control
 * (arrow keys move, space pauses).
 */
function Story({ data, onRestart }: { data: Wrapped; onRestart: () => void }) {
  const slides = useMemo(() => buildSlides(data, onRestart), [data, onRestart]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [muted, setMuted] = useState(false);
  const music = useRef<Soundtrack | null>(null);
  const last = index === slides.length - 1;
  const stopped = paused || held;

  useEffect(() => {
    const s = new Soundtrack();
    music.current = s;
    void s.start(data.key, data.bpm).catch(() => undefined);
    return () => s.stop();
  }, [data]);
  useEffect(() => music.current?.next(index), [index]);
  useEffect(() => music.current?.setMuted(muted), [muted]);

  useEffect(() => {
    if (stopped || last) return;
    const id = window.setTimeout(() => setIndex((i) => Math.min(slides.length - 1, i + 1)), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [index, stopped, last, slides.length]);

  const next = () => setIndex((i) => Math.min(slides.length - 1, i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === 'Escape') onRestart();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [slides.length, onRestart]);

  const slide = slides[index];
  const hold = { onPointerDown: () => setHeld(true), onPointerUp: () => setHeld(false), onPointerLeave: () => setHeld(false) };
  return (
    <div className={`story-stage story-stage--${slide.theme}`}>
      <div className="story-stage__bar">
        <span className="story__who">
          {data.avatarUrl && <img src={data.avatarUrl} alt="" />}
          <span>
            <strong>{data.name || data.login}</strong>
            <small>Sonyx Wrapped {data.year}</small>
          </span>
        </span>
        <div className="story-stage__tools">
          <button className="btn btn--icon" onClick={() => setPaused(!paused)} aria-label={paused ? 'Resume' : 'Pause'} title="Space">
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button className="btn btn--icon" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button className="btn btn--icon" onClick={onRestart} aria-label="Close" title="Esc">
            <X size={18} />
          </button>
        </div>
      </div>

      <button className="story-arrow story-arrow--prev" onClick={prev} disabled={index === 0} aria-label="Previous">
        <ChevronLeft size={24} />
      </button>

      <div className={`story story--${slide.theme}`}>
        <div className="story__bars" aria-hidden>
          {slides.map((s, i) => (
            <span key={s.id} className="story__bar">
              <i className={i < index ? 'is-done' : i === index && !last ? (stopped ? 'is-paused' : 'is-running') : i === index ? 'is-done' : ''} style={{ animationDuration: `${SLIDE_MS}ms` }} />
            </span>
          ))}
        </div>
        <div className="story__top">
          <span className="story__who story__who--inline">
            {data.avatarUrl && <img src={data.avatarUrl} alt="" />}@{data.login}
          </span>
          <div className="story__tools">
            <button className="btn btn--icon" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button className="btn btn--icon" onClick={onRestart} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Phones: tap the left third to go back, the rest to go forward; hold anywhere to pause. */}
        {!last && (
          <>
            <button className="story__nav story__nav--prev" aria-label="Previous" onClick={prev} {...hold} />
            <button className="story__nav story__nav--next" aria-label="Next" onClick={next} {...hold} />
          </>
        )}

        <section key={slide.id} className="story__slide">
          {slide.body}
        </section>
        {last && index > 0 && (
          <button className="story__back btn btn--quiet" onClick={() => setIndex(0)}>
            <RotateCcw size={14} /> Replay
          </button>
        )}
      </div>

      <button className="story-arrow story-arrow--next" onClick={next} disabled={last} aria-label="Next">
        <ChevronRight size={24} />
      </button>
      <p className="story-stage__hint">
        <kbd>←</kbd> <kbd>→</kbd> move · <kbd>Space</kbd> pause · <kbd>Esc</kbd> close
      </p>
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
            <Star size={16} className="story__star" /> {compact(w.topRepo.stars)} {w.topRepo.language && `· ${w.topRepo.language}`}
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
  const link = `${location.origin}/w/${encodeURIComponent(w.login)}`; // rich preview card in chats and social posts
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
    const text = `My code sounds like ${w.genre} (${w.persona.title}). What does yours sound like?`;
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
          <Share2 size={16} /> Share
        </button>
        <button className="btn btn--ghost" onClick={() => void download()}>
          <Download size={16} /> Download image
        </button>
        <a className="btn btn--ghost" href={listen}>
          <Headphones size={16} /> Hear {w.topRepo ? w.topRepo.name : 'your code'}
        </a>
        <button className="btn btn--ghost" onClick={onRestart}>
          Wrap someone else
        </button>
      </div>
      {status && <p className="note">{status}</p>}
    </div>
  );
}
