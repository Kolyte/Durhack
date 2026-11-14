/**
 * Plain-language explanations of what each part of a repository is for, shown during the tour.
 *
 * This is a rule-based explainer (folder-name conventions + metrics), so it works offline and instantly.
 * It is deliberately behind a small interface (`SectionExplainer`) so an AI explainer — e.g. Gemini,
 * called through the backend so the API key never reaches the browser — can replace or enrich it later.
 */
import type { RepoMeta } from '../types';
import type { CodeDna } from './codeDna';
import type { FileInfo, RepoModel } from './repoModel';

export interface TourSection {
  kind: 'overview' | 'directory' | 'hub';
  title: string;
  groupKey: string | null;
  /** Hub sections: the most connected file. */
  fileId: string | null;
}

export interface Explanation {
  kicker: string;
  title: string;
  body: string;
  facts: string[];
}

export type SectionExplainer = (section: TourSection, model: RepoModel, meta: RepoMeta | null, dna: CodeDna) => Explanation;

/** Conventional folder names → what they usually contain. First match wins (most specific first). */
const PURPOSES: [RegExp, string][] = [
  [/^(__tests__|tests?|spec|specs|e2e|integration)$/, 'Automated tests that check the code keeps working as it changes.'],
  [/^(examples?|samples?|demos?|playground)$/, 'Example programs showing how to use the project.'],
  [/^(docs?|documentation|guides?|website)$/, 'Documentation and guides for people using or contributing to the project.'],
  [/^(bench|benchmarks?|perf)$/, 'Benchmarks that measure how fast the code runs.'],
  [/^(routers?|routes?|routing)$/, 'Routing: decides which code handles each incoming request or URL.'],
  [/^(middlewares?|interceptors?|filters?)$/, 'Middleware: steps every request passes through (parsing, logging, auth…).'],
  [/^(controllers?|handlers?|endpoints?|api|resources?)$/, 'The API layer: entry points that receive requests and return responses.'],
  [/^(services?|usecases?|domain|business)$/, 'Business logic: the rules of what the application actually does.'],
  [/^(models?|entities|schemas?|types|dto)$/, 'The data model: the shapes of the data the application works with.'],
  [/^(db|database|migrations?|repositor(y|ies)|dao|persistence|store)$/, 'Persistence: reading and writing data to a database or store.'],
  [/^(auth|security|permissions?|session)$/, 'Security: login, sessions and who is allowed to do what.'],
  [/^(components?|ui|widgets?)$/, 'Reusable user-interface components.'],
  [/^(views?|pages?|screens?|templates?|layouts?)$/, 'Pages and templates: what the user actually sees.'],
  [/^(hooks?|composables?)$/, 'Reusable UI logic (hooks).'],
  [/^(utils?|helpers?|common|shared|support|internal)$/, 'Shared helpers used across the codebase.'],
  [/^(config|configs|settings|conf|env)$/, 'Configuration: settings that change how the app behaves.'],
  [/^(scripts?|tools?|tooling|build|ci|\.github)$/, 'Tooling and scripts for building, testing and releasing.'],
  [/^(cli|cmd|bin)$/, 'Command-line entry points.'],
  [/^(assets|static|public|images|styles?|css)$/, 'Static assets such as images and styles.'],
  [/^(i18n|locales?|lang)$/, 'Translations for different languages.'],
  [/^(lib|src|core|pkg|app|main|source)$/, 'The core library: the main implementation of the project.'],
];

const LANG: Record<string, string> = {
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', py: 'Python',
  java: 'Java', kt: 'Kotlin', go: 'Go', rs: 'Rust', c: 'C', h: 'C/C++', cpp: 'C++', cc: 'C++', hpp: 'C++',
  cs: 'C#', rb: 'Ruby', php: 'PHP', swift: 'Swift', scala: 'Scala',
};

const base = (path: string) => path.split('/').pop() ?? path;

export function languagesOf(files: FileInfo[]): string[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const lang = LANG[f.path.split('.').pop()?.toLowerCase() ?? ''];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
}

export function purposeOf(groupKey: string, files: FileInfo[]): string {
  if (groupKey === '(root)') return 'The project root: the README, package manifest and top-level configuration.';
  const segs = groupKey.toLowerCase().split('/').reverse();
  for (const seg of segs) for (const [re, text] of PURPOSES) if (re.test(seg)) return text;
  const tests = files.filter((f) => f.role === 'test').length;
  if (tests > files.length / 2) return PURPOSES[0][1];
  return `A part of the codebase named “${base(groupKey)}”.`;
}

const level = (v: number, words: [string, string, string]) => (v < 0.34 ? words[0] : v < 0.67 ? words[1] : words[2]);

export const explainSection: SectionExplainer = (section, model, meta, dna) => {
  const all = [...model.files.values()];

  if (section.kind === 'overview') {
    const top = model.groups.filter((g) => g.key !== '(root)').slice(0, 3).map((g) => g.label);
    const langs = languagesOf(all).slice(0, 3);
    return {
      kicker: 'Overview',
      title: meta?.repoName ?? 'Repository',
      body:
        `${meta ? `${meta.totalCodeFiles} source files` : `${all.length} files`}` +
        `${langs.length ? ` mostly in ${langs.join(', ')}` : ''}, organised into ${model.groups.length} areas. ` +
        `The biggest are ${top.join(', ')}. Overall the code is ${level(dna.complexity, ['simple', 'moderately branchy', 'logic-heavy'])}, ` +
        `${level(dna.connectivity, ['loosely connected', 'fairly connected', 'tightly interconnected'])} and ` +
        `${level(dna.modularity, ['not strongly modular', 'reasonably modular', 'clearly modular'])}.`,
      facts: [
        `${model.edges.length} import links found`,
        `${all.filter((f) => f.concurrency > 0).length} files use async / concurrency`,
        meta ? `${meta.stars.toLocaleString()} stars` : '',
      ].filter(Boolean),
    };
  }

  if (section.kind === 'hub' && section.fileId) {
    const f = model.files.get(section.fileId);
    if (f) {
      const touched = new Set([...f.deps, ...f.dependents].map((id) => model.files.get(id)?.group));
      return {
        kicker: 'Most connected file',
        title: base(f.path),
        body:
          `${base(f.path)} is the backbone of this codebase: it imports ${f.deps.length} files and is imported by ` +
          `${f.dependents.length}. A change here can ripple into ${touched.size} area${touched.size === 1 ? '' : 's'}. ` +
          `It lives in ${f.group}: ${purposeOf(f.group, [f]).replace(/^./, (c) => c.toLowerCase())}`,
        facts: [`${f.loc} lines`, `complexity ${f.complexity}`, f.concurrency ? `${f.concurrency} concurrency markers` : ''].filter(Boolean),
      };
    }
  }

  const group = section.groupKey ? model.groupIndex.get(section.groupKey) : undefined;
  if (!group) return { kicker: 'Section', title: section.title, body: '', facts: [] };
  const files = group.files.map((id) => model.files.get(id)!).filter(Boolean);
  const biggest = [...files].sort((a, b) => b.loc - a.loc)[0];
  const central = [...files].sort((a, b) => b.degree - a.degree)[0];
  const outside = model.edges.filter((e) => {
    const a = model.files.get(e.sourceId)?.group;
    const b = model.files.get(e.targetId)?.group;
    return (a === group.key) !== (b === group.key);
  }).length;
  const langs = languagesOf(files);
  return {
    kicker: 'Directory',
    title: group.label,
    body: purposeOf(group.key, files),
    facts: [
      `${files.length} file${files.length === 1 ? '' : 's'} · ${group.totalLoc.toLocaleString()} lines`,
      biggest ? `largest: ${base(biggest.path)}` : '',
      central && central.degree > 0 ? `most connected: ${base(central.path)} (${central.degree} links)` : '',
      outside ? `${outside} links to other areas` : 'self-contained',
      langs.length ? langs.slice(0, 2).join(' / ') : '',
    ].filter(Boolean),
  };
};
