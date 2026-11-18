import { useEffect, useMemo, useRef, useState } from 'react';
import { FileCode2, FileText, FlaskConical, Search, Settings2, Boxes } from 'lucide-react';
import type { FileInfo, RepoModel } from '../model/repoModel';
import { matchScore } from '../model/fileSearch';

const KIND_ICON = { source: FileCode2, module: Boxes, test: FlaskConical, config: Settings2, docs: FileText } as const;

/** Ctrl/Cmd+K: find a file by name and fly to its building. */
/** Mounted only while open, so each opening starts with an empty search. */
export function FileFinder({ model, onClose, onPick }: { model: RepoModel; onClose: () => void; onPick: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const files = [...model.files.values()];
    if (!query.trim()) return files.sort((a, b) => b.loc - a.loc).slice(0, 50);
    return files
      .map((f) => ({ f, s: matchScore(f.path, query) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map((x) => x.f);
  }, [model, query]);

  useEffect(() => {
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (f: FileInfo | undefined) => {
    if (!f) return;
    onPick(f.id);
    onClose();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="modal finder" role="dialog" aria-modal="true" aria-label="Find a file" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="finder__box panel">
        <label className="finder__input">
          <Search size={17} aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Find a file by name or path"
            aria-label="File name"
            aria-controls="finder-list"
            spellCheck={false}
            autoCapitalize="none"
          />
          <kbd>Esc</kbd>
        </label>
        <ul ref={list} id="finder-list" className="finder__list" role="listbox">
          {results.map((f, i) => {
            const Icon = KIND_ICON[f.kind];
            const slash = f.path.lastIndexOf('/');
            return (
              <li key={f.id} role="option" aria-selected={i === active} className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onMouseDown={(e) => (e.preventDefault(), pick(f))}>
                <Icon size={16} className="finder__icon" />
                <span className="finder__name">{f.path.slice(slash + 1)}</span>
                <span className="finder__dir">{slash > 0 ? f.path.slice(0, slash) : ''}</span>
                <span className="finder__loc">{f.loc.toLocaleString()} lines</span>
              </li>
            );
          })}
          {results.length === 0 && <li className="finder__empty">No files match “{query}”.</li>}
        </ul>
        <div className="finder__foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> choose
          </span>
          <span>
            <kbd>Enter</kbd> go to building
          </span>
          {!query && <span className="finder__hint">Largest files first</span>}
        </div>
      </div>
    </div>
  );
}
