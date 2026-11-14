import { audioEngine, engineStore } from '../audio/AudioEngine';
import { describeFile } from '../audio/composer';
import { PRESETS } from '../audio/presets';
import type { FileInfo, RepoModel } from '../model/repoModel';
import { useStore } from '../state/store';

const ROLE_LABEL: Record<FileInfo['kind'], string> = {
  source: 'Source file',
  module: 'Module / entry point',
  test: 'Test',
  config: 'Configuration',
  docs: 'Documentation',
};

export function FileInspector({
  file,
  model,
  onSelect,
  onClose,
}: {
  file: FileInfo;
  model: RepoModel;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { preset } = useStore(engineStore);
  const group = model.groupIndex.get(file.group);
  const name = file.path.split('/').pop();
  const links = [
    ...file.deps.map((id) => ({ id, dir: 'imports' as const })),
    ...file.dependents.map((id) => ({ id, dir: 'imported by' as const })),
  ];

  return (
    <aside className="inspector panel" aria-label="File inspector">
      <div className="panel__head">
        <div>
          <div className="eyebrow">{ROLE_LABEL[file.kind]}</div>
          <h2 className="inspector__name">{name}</h2>
          <div className="inspector__path">{file.path}</div>
        </div>
        <button className="btn btn--icon" onClick={onClose} aria-label="Close inspector">
          ✕
        </button>
      </div>

      <dl className="stats">
        <div>
          <dt>Lines</dt>
          <dd>{file.analyzed ? file.loc : `~${file.loc}`}</dd>
        </div>
        <div>
          <dt>Complexity</dt>
          <dd>{file.role === 'source' || file.role === 'test' ? file.complexity : '—'}</dd>
        </div>
        <div>
          <dt>Imports</dt>
          <dd>{file.imports}</dd>
        </div>
        <div>
          <dt>Concurrency</dt>
          <dd>{file.concurrency}</dd>
        </div>
        <div className="stats__wide">
          <dt>Directory</dt>
          <dd>{group?.label ?? '—'}</dd>
        </div>
      </dl>

      <button className="btn btn--primary btn--block" onClick={() => audioEngine.playSignature(file)}>
        ♪ Play musical signature
      </button>

      <h3 className="panel__title">How it shapes the music</h3>
      <ul className="explain">
        {describeFile(file, PRESETS[preset], group?.index ?? 0).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      {links.length > 0 && (
        <>
          <h3 className="panel__title">Connections ({links.length})</h3>
          <ul className="links">
            {links.map((l) => (
              <li key={`${l.dir}-${l.id}`}>
                <button className="link" onClick={() => onSelect(l.id)}>
                  <span className="links__dir">{l.dir}</span> {l.id.split('/').pop()}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {!file.analyzed && <p className="note">Not fetched yet; size is estimated from the file's byte count.</p>}
    </aside>
  );
}
