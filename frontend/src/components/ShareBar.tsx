import { useState } from 'react';
import { toast } from '../state/account';
import { RecordButton } from './RecordButton';

/** Share a repo's Sonyx page (with a rich link preview) or grab a README badge for it. */
export function ShareBar({ repoName, score }: { repoName: string; score: number }) {
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const origin = window.location.origin;
  const link = `${origin}/r/${repoName}`;
  const badge = `[![Listen on Sonyx](${origin}/badge/${repoName}.svg)](${link})`;
  const embed = `<iframe src="${origin}/?repo=${repoName}&embed=1" width="720" height="420" style="border:0;border-radius:12px" allow="autoplay; fullscreen" loading="lazy" title="${repoName} on Sonyx"></iframe>`;

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
      <a className="btn btn--ghost btn--sm" href={`/battle.html?a=${encodeURIComponent(repoName)}`}>
        ⚔️ Battle
      </a>
      <button className="btn btn--ghost btn--sm" onClick={() => (setEmbedOpen(!embedOpen), setBadgeOpen(false))} aria-expanded={embedOpen}>
        &lt;/&gt; Embed
      </button>
      <button className="btn btn--ghost btn--sm" onClick={() => (setBadgeOpen(!badgeOpen), setEmbedOpen(false))} aria-expanded={badgeOpen}>
        🏷️ README badge
      </button>
      {embedOpen && (
        <div className="sharebar__badge">
          <textarea readOnly value={embed} rows={4} onFocus={(e) => e.currentTarget.select()} aria-label="Embed code" />
          <button
            className="btn btn--accent btn--sm"
            onClick={() =>
              void navigator.clipboard
                .writeText(embed)
                .then(() => toast('Embed code copied: paste it into your docs or blog'))
                .catch(() => toast('Select the text and copy it'))
            }
          >
            Copy embed code
          </button>
          <p className="note">A live 3D player with the music, for your docs, blog or portfolio.</p>
        </div>
      )}
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
