import { useEffect, useState } from 'react';
import { Check, Copy, Download, ImageIcon, Link2, Share2, X } from 'lucide-react';
import { renderShareCard, type CardFormat } from './shareCard';
import type { Wrapped } from './types';
import { shareText, wrappedLink } from './shareText';

/** One-click share targets: each opens the site's own share page with the text and link filled in. */
function targets(text: string, url: string) {
  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);
  return [
    { name: 'X', href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { name: 'Bluesky', href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}` },
    { name: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { name: 'Reddit', href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
  ];
}

const canCopyImage = typeof window !== 'undefined' && 'ClipboardItem' in window && !!navigator.clipboard?.write;

/** Everything needed to show off a Wrapped: link, social sites, and the image in two sizes. */
export function SharePanel({ w, own }: { w: Wrapped; own: boolean }) {
  const [done, setDone] = useState<string | null>(null);
  const link = wrappedLink(w);
  const text = shareText(w, own);
  const flash = (what: string) => {
    setDone(what);
    window.setTimeout(() => setDone((d) => (d === what ? null : d)), 2200);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      flash('link');
    } catch {
      /* the field below can still be selected by hand */
    }
  };
  const copyImage = async () => {
    try {
      // Safari needs the ClipboardItem to be created synchronously with a promise inside.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderShareCard(w).then((b) => b ?? new Blob()) })]);
      flash('image');
    } catch {
      flash('image-failed');
    }
  };
  const download = async (format: CardFormat) => {
    const blob = await renderShareCard(w, format);
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sonyx-wrapped-${w.login}-${w.year}${format === 'story' ? '-story' : ''}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    flash(format);
  };
  const native = async () => {
    try {
      const blob = await renderShareCard(w);
      const file = blob ? new File([blob], `sonyx-wrapped-${w.login}.png`, { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text, url: link });
      else await navigator.share({ text, url: link });
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="share-panel">
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button className="btn btn--primary btn--block share-panel__native" onClick={() => void native()}>
          <Share2 size={16} /> Share…
        </button>
      )}

      <div className="share-panel__link">
        <Link2 size={15} aria-hidden />
        <input readOnly value={link.replace(/^https?:\/\//, '')} onFocus={(e) => e.currentTarget.select()} aria-label="Link to this Wrapped" />
        <button className="btn btn--sm" onClick={() => void copyLink()}>
          {done === 'link' ? <Check size={14} /> : <Copy size={14} />}
          {done === 'link' ? 'Copied' : 'Copy link'}
        </button>
      </div>

      <div className="share-panel__targets" aria-label="Share on">
        {targets(text, link).map((t) => (
          <a key={t.name} className="btn btn--ghost btn--sm" href={t.href} target="_blank" rel="noopener noreferrer">
            {t.name}
          </a>
        ))}
      </div>

      <div className="share-panel__images">
        {canCopyImage && (
          <button className="btn btn--ghost btn--sm" onClick={() => void copyImage()} title="Paste it straight into Discord, Slack or a post">
            {done === 'image' ? <Check size={14} /> : <ImageIcon size={14} />}
            {done === 'image' ? 'Image copied' : done === 'image-failed' ? "Couldn't copy" : 'Copy image'}
          </button>
        )}
        <button className="btn btn--ghost btn--sm" onClick={() => void download('post')} title="1080×1350, for posts">
          {done === 'post' ? <Check size={14} /> : <Download size={14} />} Post image
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => void download('story')} title="1080×1920, for Instagram and TikTok stories">
          {done === 'story' ? <Check size={14} /> : <Download size={14} />} Story image
        </button>
      </div>
      <p className="share-panel__note">The link shows a preview card with the genre and stats wherever you paste it.</p>
    </div>
  );
}

/** The share panel as a dialog (from the story's top bar or the start page). */
export function ShareDialog({ w, own, onClose }: { w: Wrapped; own: boolean; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__card panel share-dialog">
        <button className="btn btn--icon modal__close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <h2 id="share-title" className="modal__title">
          Share {own ? 'your' : `${w.name || '@' + w.login}'s`} Wrapped
        </h2>
        <SharePanel w={w} own={own} />
      </div>
    </div>
  );
}
