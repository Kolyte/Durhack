import type { RepoModel } from '../model/repoModel';
import { hoverStore } from '../state/hover';
import { useStore } from '../state/store';

export function HoverTooltip({ model }: { model: RepoModel }) {
  const { id, x, y } = useStore(hoverStore);
  const f = id ? model.files.get(id) : undefined;
  if (!f) return null;
  return (
    <div className="tooltip" style={{ transform: `translate(${x + 14}px, ${y + 14}px)` }} role="tooltip">
      <strong>{f.path.split('/').pop()}</strong>
      <span>
        {f.loc} lines
        {f.role === 'source' || f.role === 'test' ? ` · complexity ${f.complexity}` : ''}
        {f.degree ? ` · ${f.degree} links` : ''}
      </span>
    </div>
  );
}
