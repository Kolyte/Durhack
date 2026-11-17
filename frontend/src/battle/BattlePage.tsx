import { useCallback, useEffect, useState } from 'react';
import { analyzeRepo, type Analysis } from '../api/analyze';
import { apiFetch } from '../api/http';
import { DNA_LABELS, sonyxScore } from '../model/codeDna';

type Axis = keyof typeof DNA_LABELS;
const AXES = Object.keys(DNA_LABELS) as Axis[];

const SUGGESTED: [string, string][] = [
  ['facebook/react', 'vuejs/core'],
  ['pallets/flask', 'expressjs/express'],
  ['golang/go', 'rust-lang/rust'],
  ['django/django', 'rails/rails'],
  ['sveltejs/svelte', 'angular/angular'],
];

type Side = { state: 'idle' } | { state: 'loading'; done: number; total: number } | { state: 'error'; message: string } | { state: 'ready'; result: Analysis };

const clean = (s: string) => s.trim().replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/+$/, '');

/** Repo battles: two codebases analysed side by side, compared axis by axis, then voted on. */
export function BattlePage() {
  const params = new URLSearchParams(window.location.search);
  const [a, setA] = useState(params.get('a') ?? '');
  const [b, setB] = useState(params.get('b') ?? '');
  const [sides, setSides] = useState<[Side, Side]>([{ state: 'idle' }, { state: 'idle' }]);
  const [fighting, setFighting] = useState<[string, string] | null>(null);

  const run = useCallback((x: string, y: string) => {
    const pair: [string, string] = [clean(x), clean(y)];
    if (!pair[0] || !pair[1] || pair[0].toLowerCase() === pair[1].toLowerCase()) return;
    setA(pair[0]);
    setB(pair[1]);
    setFighting(pair);
    const url = new URL(window.location.href);
    url.searchParams.set('a', pair[0]);
    url.searchParams.set('b', pair[1]);
    window.history.replaceState(null, '', url);
    setSides([
      { state: 'loading', done: 0, total: 0 },
      { state: 'loading', done: 0, total: 0 },
    ]);
    pair.forEach((repo, i) => {
      const set = (s: Side) => setSides((prev) => (i === 0 ? [s, prev[1]] : [prev[0], s]));
      analyzeRepo(`https://github.com/${repo}`, (done, total) => set({ state: 'loading', done, total }))
        .then((result) => set({ state: 'ready', result }))
        .catch((e: Error) => set({ state: 'error', message: e.message }));
    });
  }, []);

  useEffect(() => {
    const x = params.get('a');
    const y = params.get('b');
    if (x && y) run(x, y);
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = sides[0].state === 'ready' && sides[1].state === 'ready';
  return (
    <div className="battle">
      <header className="battle__head">
        <a className="wrapped__brand" href="/">
          ◈ Sonyx
        </a>
        <h1>
          Repo <span className="hero__accent">Battles</span>
        </h1>
        <p>Two codebases, head to head. Whose Code DNA wins, and which one sounds better?</p>
        <form
          className="battle__form"
          onSubmit={(e) => {
            e.preventDefault();
            run(a, b);
          }}
        >
          <input className="input" value={a} onChange={(e) => setA(e.target.value)} placeholder="owner/repo" aria-label="First repository" spellCheck={false} />
          <span className="battle__vs">VS</span>
          <input className="input" value={b} onChange={(e) => setB(e.target.value)} placeholder="owner/repo" aria-label="Second repository" spellCheck={false} />
          <button className="btn btn--accent" type="submit" disabled={!a.trim() || !b.trim()}>
            ⚔️ Battle
          </button>
        </form>
        <div className="battle__suggest">
          {SUGGESTED.map(([x, y]) => (
            <button key={x + y} className="chip" onClick={() => run(x, y)}>
              {x.split('/')[1]} vs {y.split('/')[1]}
            </button>
          ))}
        </div>
      </header>

      {fighting && (
        <main className="battle__arena">
          <div className="battle__cards">
            <SideCard name={fighting[0]} side={sides[0]} color="teal" />
            <SideCard name={fighting[1]} side={sides[1]} color="pink" />
          </div>
          {ready && <Results a={(sides[0] as { result: Analysis }).result} b={(sides[1] as { result: Analysis }).result} names={fighting} />}
        </main>
      )}
      <PopularBattles onPick={run} />
    </div>
  );
}

function SideCard({ name, side, color }: { name: string; side: Side; color: 'teal' | 'pink' }) {
  const score = side.state === 'ready' ? sonyxScore(side.result.dna) : null;
  return (
    <section className={`fighter fighter--${color}`}>
      <div className="fighter__name">{name}</div>
      {side.state === 'loading' && (
        <>
          <div className="eq eq--small" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
          <div className="progress">
            <div className="progress__bar" style={{ width: `${side.total ? Math.round((side.done / side.total) * 100) : 5}%` }} />
          </div>
          <p className="note">Listening… {side.total ? `${side.done}/${side.total} files` : ''}</p>
        </>
      )}
      {side.state === 'error' && <p className="note note--error">{side.message}</p>}
      {side.state === 'ready' && score !== null && (
        <>
          <div className="fighter__score">{score.toFixed(1)}</div>
          <p className="note">
            {side.result.meta.stars.toLocaleString()} ★ · {side.result.dna.analyzedCodeFiles} files analysed
          </p>
          <a className="btn btn--ghost btn--sm" href={`/?repo=${encodeURIComponent(name)}`}>
            🎧 Hear it
          </a>
        </>
      )}
    </section>
  );
}

function Results({ a, b, names }: { a: Analysis; b: Analysis; names: [string, string] }) {
  const sa = sonyxScore(a.dna);
  const sb = sonyxScore(b.dna);
  const wins = AXES.map((k) => Math.sign(a.dna[k] - b.dna[k]));
  const roundsA = wins.filter((w) => w > 0).length;
  const roundsB = wins.filter((w) => w < 0).length;
  const winner = sa === sb ? null : sa > sb ? 0 : 1;
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const text = winner === null ? `${names[0]} vs ${names[1]}: a perfect tie on Sonyx ⚔️` : `${names[winner]} beats ${names[1 - winner]} on Sonyx (${Math.max(sa, sb).toFixed(1)} vs ${Math.min(sa, sb).toFixed(1)}) ⚔️ Do you agree?`;
    const url = window.location.href;
    try {
      if (navigator.share) return void (await navigator.share({ text, url }));
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {
      /* cancelled */
    }
  };

  return (
    <section className="results">
      <div className="results__verdict">
        {winner === null ? (
          <h2>It's a tie!</h2>
        ) : (
          <h2>
            🏆 <span className={winner === 0 ? 'c-teal' : 'c-pink'}>{names[winner]}</span> wins
          </h2>
        )}
        <p>
          Rounds won: {roundsA}–{roundsB} · Score {sa.toFixed(1)} vs {sb.toFixed(1)}
        </p>
      </div>
      <div className="results__body">
        <Radar a={a} b={b} />
        <ul className="rounds">
          {AXES.map((k, i) => (
            <li key={k} className={wins[i] > 0 ? 'win-a' : wins[i] < 0 ? 'win-b' : ''}>
              <span className="rounds__label">{DNA_LABELS[k]}</span>
              <span className="rounds__bar rounds__bar--a">
                <i style={{ width: `${Math.round(a.dna[k] * 100)}%` }} />
              </span>
              <span className="rounds__num">{Math.round(a.dna[k] * 100)}</span>
              <span className="rounds__num">{Math.round(b.dna[k] * 100)}</span>
              <span className="rounds__bar rounds__bar--b">
                <i style={{ width: `${Math.round(b.dna[k] * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Vote names={names} />
      <div className="results__actions">
        <button className="btn btn--primary" onClick={() => void share()}>
          ↗ Share this battle
        </button>
        {copied && <span className="note">Link copied</span>}
      </div>
    </section>
  );
}

/** Both DNA shapes overlaid on one pentagon radar. */
function Radar({ a, b }: { a: Analysis; b: Analysis }) {
  const R = 90;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
    return `${110 + Math.cos(ang) * R * v},${110 + Math.sin(ang) * R * v}`;
  };
  const shape = (x: Analysis) => AXES.map((k, i) => pt(i, Math.max(0.05, x.dna[k]))).join(' ');
  return (
    <svg className="radar" viewBox="0 0 220 220" role="img" aria-label="Code DNA comparison">
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} points={AXES.map((_, i) => pt(i, r)).join(' ')} className="radar__ring" />
      ))}
      <polygon points={shape(a)} className="radar__a" />
      <polygon points={shape(b)} className="radar__b" />
      {AXES.map((k, i) => {
        const [x, y] = pt(i, 1.2).split(',').map(Number);
        return (
          <text key={k} x={x} y={y} className="radar__label" textAnchor="middle" dominantBaseline="middle">
            {DNA_LABELS[k]}
          </text>
        );
      })}
    </svg>
  );
}

function Vote({ names }: { names: [string, string] }) {
  const [votes, setVotes] = useState<Record<string, number> | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const qs = `a=${encodeURIComponent(names[0])}&b=${encodeURIComponent(names[1])}`;

  useEffect(() => {
    let alive = true;
    apiFetch(`/api/battles/votes?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { votes: Record<string, number>; mine: string | null }) => {
        if (!alive) return;
        setVotes(d.votes);
        setMine(d.mine);
      })
      .catch(() => alive && setOffline(true));
    return () => {
      alive = false;
    };
  }, [qs]);

  if (offline) return null;
  const key = (n: string) => n.toLowerCase();
  const va = votes?.[key(names[0])] ?? 0;
  const vb = votes?.[key(names[1])] ?? 0;
  const total = va + vb;
  const cast = async (choice: string) => {
    const r = await apiFetch('/api/battles/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: names[0], b: names[1], choice }),
    }).catch(() => null);
    if (!r?.ok) return setOffline(true);
    const d = (await r.json()) as { votes: Record<string, number>; mine: string | null };
    setVotes(d.votes);
    setMine(d.mine);
  };

  return (
    <div className="vote">
      <p className="vote__q">Which would you rather listen to?</p>
      <div className="vote__buttons">
        {names.map((n, i) => {
          const v = i === 0 ? va : vb;
          const pct = total ? Math.round((v / total) * 100) : 0;
          return (
            <button key={n} className={`vote__btn vote__btn--${i === 0 ? 'a' : 'b'}${mine === key(n) ? ' is-mine' : ''}`} onClick={() => void cast(n)}>
              <span className="vote__fill" style={{ width: `${mine ? pct : 0}%` }} />
              <span className="vote__label">{n}</span>
              {mine && <span className="vote__pct">{pct}%</span>}
            </button>
          );
        })}
      </div>
      {mine && <p className="note">{total.toLocaleString()} {total === 1 ? 'vote' : 'votes'} · tap the other side to change yours</p>}
    </div>
  );
}

function PopularBattles({ onPick }: { onPick: (a: string, b: string) => void }) {
  const [list, setList] = useState<{ a: string; b: string; votesA: number; votesB: number }[]>([]);
  useEffect(() => {
    apiFetch('/api/battles/popular')
      .then((r) => (r.ok ? r.json() : []))
      .then(setList)
      .catch(() => undefined);
  }, []);
  if (!list.length) return null;
  return (
    <section className="popular">
      <h2>🔥 Popular battles</h2>
      <ul>
        {list.map((t) => (
          <li key={t.a + t.b}>
            <button className="link" onClick={() => onPick(t.a, t.b)}>
              {t.a} <b>vs</b> {t.b}
            </button>
            <span className="note">{t.votesA + t.votesB} votes</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
