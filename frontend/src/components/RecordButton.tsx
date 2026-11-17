import { accountStore, openPricing } from '../state/account';
import { canRecord, recordClip, recorderStore, stopRecording } from '../state/recorder';
import { useStore } from '../state/store';

/** "Record clip" button (a Pro feature once billing is set up) and the on-screen REC indicator. */
export function RecordButton({ repoName }: { repoName: string }) {
  const { state } = useStore(recorderStore);
  const { me } = useStore(accountStore);
  if (!canRecord()) return null;
  const locked = !me.canUsePro;
  return (
    <button
      className="btn btn--ghost btn--sm"
      disabled={state !== 'idle'}
      onClick={() => (locked ? openPricing() : void recordClip(repoName))}
      title="Record a 15-second video of the scene with its music"
    >
      🎬 Record clip{locked && <span className="plan-badge plan-badge--pro">Pro</span>}
    </button>
  );
}

export function RecordingIndicator() {
  const { state, elapsed, length } = useStore(recorderStore);
  if (state === 'idle') return null;
  return (
    <div className="rec panel" role="status">
      {state === 'recording' ? (
        <>
          <span className="rec__dot" aria-hidden />
          REC {Math.max(0, Math.ceil(length - elapsed))}s
          <button className="btn btn--ghost btn--sm" onClick={stopRecording}>
            Stop
          </button>
        </>
      ) : (
        'Saving clip…'
      )}
    </div>
  );
}
