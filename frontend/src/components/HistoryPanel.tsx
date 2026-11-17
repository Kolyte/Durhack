import { applyPosition, closeHistory, historyStore, pause, play } from '../state/history';
import { useStore } from '../state/store';

/** Time-lapse controls: play the repo's growth, scrub through its history, read each moment's commit. */
export function HistoryPanel() {
  const { open, loading, error, data, position, playing } = useStore(historyStore);
  if (!open) return null;
  const snap = data ? data.snapshots[Math.round(position)] : null;
  const date = snap ? new Date(snap.date) : null;
  return (
    <section className="history panel" aria-label="Time-lapse">
      <div className="history__head">
        <span className="eyebrow">⏳ Time-lapse</span>
        <button className="btn btn--icon" onClick={closeHistory} aria-label="Close time-lapse">
          ✕
        </button>
      </div>
      {loading && <p className="note">Reading the repository's history…</p>}
      {error && <p className="note note--error">{error}</p>}
      {data && snap && date && (
        <>
          <div className="history__when">
            <strong>{date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</strong>
            <span>{snap.files.toLocaleString()} files</span>
          </div>
          <p className="history__msg" title={snap.message}>
            “{snap.message || 'No message'}”
          </p>
          <div className="history__controls">
            <button className="btn btn--round" onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '❚❚' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={data.snapshots.length - 1}
              step={0.01}
              value={position}
              onChange={(e) => (pause(), applyPosition(Number(e.target.value)))}
              aria-label="Point in history"
            />
          </div>
          <p className="note">
            {data.totalCommits.toLocaleString()} commits on {data.branch}, sampled at {data.snapshots.length} moments.
          </p>
        </>
      )}
    </section>
  );
}
