import { ShareBar } from './ShareBar';
import { useState } from 'react';
import { DNA_LABELS, sonyxScore, type CodeDna } from '../model/codeDna';
import type { RepoMeta } from '../types';

type Key = keyof typeof DNA_LABELS;
const KEYS = Object.keys(DNA_LABELS) as Key[];

const EFFECT: Record<Key, string> = {
  complexity: 'wider melodic leaps',
  connectivity: 'richer chords, more cables',
  modularity: 'more separated clusters',
  concurrency: 'busier arpeggios',
  size: 'denser arrangement',
};

function Radar({ dna }: { dna: CodeDna }) {
  const size = 168;
  const c = size / 2;
  const r = c - 26;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / KEYS.length;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v];
  };
  const poly = KEYS.map((k, i) => pt(i, Math.max(0.04, dna[k])).join(',')).join(' ');
  return (
    <svg className="radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Code DNA radar chart">
      {[0.25, 0.5, 0.75, 1].map((lv) => (
        <polygon key={lv} className="radar__grid" points={KEYS.map((_, i) => pt(i, lv).join(',')).join(' ')} />
      ))}
      {KEYS.map((k, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.2);
        return (
          <g key={k}>
            <line className="radar__axis" x1={c} y1={c} x2={x} y2={y} />
            <text className="radar__label" x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">
              {DNA_LABELS[k]}
            </text>
          </g>
        );
      })}
      <polygon className="radar__shape" points={poly} />
    </svg>
  );
}

export function MetricsPanel({ dna, meta, embedded = false }: { dna: CodeDna; meta: RepoMeta | null; embedded?: boolean }) {
  const [open, setOpen] = useState(true);
  const score = sonyxScore(dna);
  return (
    <aside className={`dna${embedded ? ' dna--embedded' : ' panel'}${open ? '' : ' is-collapsed'}`} aria-label="Code DNA">
      <button className="panel__head panel__head--button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div>
          <div className="eyebrow">Code DNA</div>
          <div className="dna__repo">{meta?.repoName ?? '—'}</div>
        </div>
        <div className="dna__score" title="Sonyx score: the average of the five Code DNA axes (same as the leaderboard)">
          <span className="dna__score-value">{score.toFixed(1)}</span>
          <span className="dna__score-label">score</span>
        </div>
        <span aria-hidden>{open ? '–' : '+'}</span>
      </button>
      {open && (
        <>
          <Radar dna={dna} />
          <ul className="dna__bars">
            {KEYS.map((k) => (
              <li key={k}>
                <div className="dna__row">
                  <span>{DNA_LABELS[k]}</span>
                  <span className="dna__num">{Math.round(dna[k] * 100)}</span>
                </div>
                <div className="bar">
                  <div className="bar__fill" style={{ width: `${Math.round(dna[k] * 100)}%` }} />
                </div>
                <div className="dna__effect">→ {EFFECT[k]}</div>
              </li>
            ))}
          </ul>
          {meta && (
            <p className="note">
              {meta.stars.toLocaleString()} stars · {dna.analyzedCodeFiles} source files analysed
            </p>
          )}
          {meta && <ShareBar repoName={meta.repoName} score={score} privateRepo={meta.privateRepo} />}
          <ul className="caveats">
            {dna.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
