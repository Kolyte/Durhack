import { useEffect } from 'react';
import { X } from 'lucide-react';

const GROUPS: [string, [string[], string][]][] = [
  ['Explore', [[['Ctrl', 'K'], 'Find a file'], [['1'], 'Code City'], [['2'], 'Galaxy'], [['3'], 'Code Tree'], [['Esc'], 'Close details']]],
  ['Music', [[['Space'], 'Play or pause'], [['T'], 'Start or pause the guided tour'], [['←', '→'], 'Previous or next section (tour)']]],
  ['Camera', [[['Drag'], 'Orbit'], [['Scroll'], 'Zoom'], [['Right-drag'], 'Pan']]],
];

/** "?" opens this: every keyboard shortcut on one card. */
export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__card panel shortcuts">
        <button className="btn btn--icon modal__close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <h2 id="shortcuts-title" className="modal__title">
          Keyboard shortcuts
        </h2>
        <div className="shortcuts__grid">
          {GROUPS.map(([title, rows]) => (
            <section key={title}>
              <h3>{title}</h3>
              <dl>
                {rows.map(([keys, what]) => (
                  <div key={what}>
                    <dt>
                      {keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="modal__fine">
          Press <kbd>?</kbd> any time to see this again.
        </p>
      </div>
    </div>
  );
}
