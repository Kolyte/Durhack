import { useEffect, useState } from 'react';
import { MousePointerClick, Move3d, Search, X } from 'lucide-react';

const KEY = 'sonyx.seenHint';
const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

/** Shown once, the first time a repository opens: how to move around and where to start. */
export function FirstVisitHint() {
  const [open, setOpen] = useState(() => !seen());
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(close, 12000);
    return () => window.clearTimeout(id);
  }, [open]);
  if (!open) return null;
  return (
    <div className="first-hint panel" role="status">
      <span>
        <Move3d size={15} /> {touch ? 'Drag to orbit, pinch to zoom' : 'Drag to orbit, scroll to zoom'}
      </span>
      <span>
        <MousePointerClick size={15} /> {touch ? 'Tap' : 'Click'} a building for details
      </span>
      {!touch && (
        <span>
          <Search size={15} /> <kbd>Ctrl</kbd> <kbd>K</kbd> finds a file
        </span>
      )}
      <button className="btn btn--icon" onClick={close} aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}
