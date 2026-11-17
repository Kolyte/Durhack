import { useState } from 'react';
import { toast } from '../state/account';
import { RecordButton } from './RecordButton';

/** Share a repo's Sonyx page (with a rich link preview) or grab a README badge for it. */
export function ShareBar({ repoName, score }: { repoName: string; score: number }) {
  const [badgeOpen, setBadgeOpen] = useState(false);
  const origin = window.location.origin;
  const link = `${origin}/r/${repoName}`;
  const badge = `[![Listen on Sonyx](${origin}/badge/${repoName}.svg)](${link})`;

  const share = async () => {
    const text = `${repoName} scores ${score.toFixed(1)} on Sonyx. Hear what its code sounds like 🎧`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${repoName} on Sonyx`, text, url: link });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${link}`);
      toast('Link copied: paste it anywhere for a preview card');
    } catch {
      /* cancelled */
    }
  };
  const copyBadge = async () => {
    try {
      await navigator.clipboard.writeText(badge);
      toast('Badge copied: paste it into your README');
    } catch {
      toast('Select the text and copy it');
    }
  };

  return (
    <div className="sharebar">
      <button className="btn btn--primary btn--sm" onClick={() => void share()}>
        ↗ Share
      </button>
      <RecordButton repoName={repoName} />
      <button className="btn btn--ghost btn--sm" onClick={() => setBadgeOpen(!badgeOpen)} aria-expanded={badgeOpen}>
        🏷️ README badge
      </button>
      {badgeOpen && (
        <div className="sharebar__badge">
          <img src={`/badge/${repoName}.svg`} alt="Sonyx badge preview" height={20} />
          <textarea readOnly value={badge} rows={3} onFocus={(e) => e.currentTarget.select()} aria-label="Badge Markdown" />
          <button className="btn btn--accent btn--sm" onClick={() => void copyBadge()}>
            Copy Markdown
          </button>
          <p className="note">Shows your Code DNA score and leaderboard rank, and links people straight to the music.</p>
        </div>
      )}
    </div>
  );
}
