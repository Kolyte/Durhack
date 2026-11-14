/**
 * Plain-language explanations of what a file (and its folder) is for, shown in the file inspector.
 *
 * This is a rule-based explainer (naming conventions + metrics), so it works offline and instantly.
 * It sits behind a small interface (`FileExplainer`) so an AI explainer such as Gemini can replace or
 * enrich it later. Call that through the backend so the API key never reaches the browser.
 */
import type { FileInfo, RepoModel } from './repoModel';

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

const base = (path: string) => path.split('/').pop() ?? path;

export function purposeOf(groupKey: string, files: FileInfo[]): string {
  if (groupKey === '(root)') return 'The project root: the README, package manifest and top-level configuration.';
  const segs = groupKey.toLowerCase().split('/').reverse();
  for (const seg of segs) for (const [re, text] of PURPOSES) if (re.test(seg)) return text;
  const tests = files.filter((f) => f.role === 'test').length;
  if (tests > files.length / 2) return PURPOSES[0][1];
  return `A part of the codebase named “${base(groupKey)}”.`;
}

// ───────────────────────────── per-file explanations ─────────────────────────────

/** Well-known file names → what they do. */
const KNOWN_FILES: [RegExp, string][] = [
  [/^readme(\.\w+)?$/i, "The project's front page: what it is and how to install and use it."],
  [/^(license|licence|copying)(\.\w+)?$/i, 'The licence: the legal terms for using and sharing this code.'],
  [/^(changelog|history|changes)(\.\w+)?$/i, 'The changelog: a history of what changed in each release.'],
  [/^contributing(\.\w+)?$/i, 'Guidelines for people who want to contribute to the project.'],
  [/^security(\.\w+)?$/i, 'How to report security vulnerabilities responsibly.'],
  [/^code_of_conduct(\.\w+)?$/i, 'Community rules for how contributors should behave.'],
  [/^package\.json$/i, 'The npm manifest: the package name, its dependencies and its scripts (test, build, start…).'],
  [/^(pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?)$/i, 'The Java build file: dependencies and how the project is compiled and packaged.'],
  [/^(requirements(-\w+)?\.txt|pyproject\.toml|setup\.(py|cfg)|pipfile)$/i, 'Python packaging: the dependencies this project needs.'],
  [/^(go\.mod)$/i, 'The Go module file: the module name and its dependencies.'],
  [/^(cargo\.toml)$/i, 'The Rust crate manifest: name, version and dependencies.'],
  [/^dockerfile$/i, 'Instructions to package the app into a Docker container image.'],
  [/^(docker-)?compose\.ya?ml$/i, 'Docker Compose: runs the app together with the services it needs.'],
  [/^makefile$/i, 'Make targets: shortcuts for building, testing and running.'],
  [/^tsconfig(\.\w+)?\.json$/i, 'TypeScript compiler settings.'],
  [/^(vite|webpack|rollup|babel|jest|vitest|next|nuxt|svelte|tailwind|postcss)\.config\.\w+$/i, 'Configuration for a build or test tool.'],
  [/^\.(eslintrc|prettierrc|editorconfig|stylelintrc)(\.\w+)?$/i, 'Code-style rules that keep formatting and conventions consistent.'],
  [/^\.(gitignore|gitattributes|npmignore)$/i, 'Tells git (or npm) which files to ignore.'],
  [/^\.env(\.\w+)?$/i, 'Environment variables (example values for local settings).'],
  [/^application(-\w+)?\.(properties|ya?ml)$/i, 'Spring Boot configuration: ports, database and app settings.'],
  [/\.ya?ml$/i, 'A YAML configuration file.'],
  [/\.json$/i, 'A JSON configuration or data file.'],
];

/** Naming conventions in file base names (without extension) → their usual role. */
const NAME_ROLES: [RegExp, string][] = [
  [/^(index|main|app|server|application|program|__main__|mod|lib)$/i, 'An entry point: where this part of the program starts or exposes its public API.'],
  [/^(__init__)$/i, 'Marks a Python package and defines what it exports.'],
  [/(router|routes?|routing)$/i, 'Routing: maps incoming requests or URLs to the code that handles them.'],
  [/controller$/i, 'A controller: receives web requests, calls the business logic and returns responses.'],
  [/(handler|endpoint|resource)s?$/i, 'A request handler: the code that runs for a specific API call or event.'],
  [/service$/i, 'A service: business logic that controllers and other parts call into.'],
  [/(repository|repo|dao|store)$/i, 'Data access: reads and writes records in a database or store.'],
  [/(model|entity|schema|dto|record)s?$/i, 'A data model: describes the shape of the data the app works with.'],
  [/(middleware|interceptor|filter)s?$/i, 'Middleware: runs on every request before or after the main handler (parsing, auth, logging…).'],
  [/(util|utils|helper|helpers|common|shared)$/i, 'Helpers: small reusable functions used across the codebase.'],
  [/(config|configuration|settings|options|constants?)$/i, 'Configuration or constants that other files read.'],
  [/(types?|interfaces?|typings)$/i, 'Type definitions shared by other files.'],
  [/(error|errors|exception|exceptions)$/i, 'Error types and error handling.'],
  [/^use[A-Z]/, 'A React hook: reusable UI logic.'],
  [/(view|page|screen|template|layout)s?$/i, 'A page or template: what the user sees.'],
  [/(request|response|req|res)$/i, 'Wraps an HTTP request or response with convenience methods.'],
  [/(cli|command|cmd)$/i, 'A command-line interface.'],
  [/(test|spec)$/i, 'A test file.'],
];

export interface FileExplanation {
  purpose: string;
  details: string[];
}

export type FileExplainer = (file: FileInfo, model: RepoModel) => FileExplanation;

const stripTestAffixes = (name: string) =>
  name.replace(/(\.test|\.spec|_test|Tests?|Spec)$/i, '').replace(/^test_?/i, '');

/** Plain-language description of what one file is for, from its name, folder, role and connections. */
export const explainFile: FileExplainer = (file, model) => {
  const name = base(file.path);
  const stem = name.replace(/\.[^.]+$/, '');
  let purpose = '';

  if (file.role === 'test') {
    const subject = stripTestAffixes(stem).replace(/^[._-]+|[._-]+$/g, '');
    const target = [...file.deps].map((id) => model.files.get(id)).find((f) => f && f.role !== 'test');
    purpose = target
      ? `Automated tests for ${base(target.path)}: they check it still behaves correctly after changes.`
      : `Automated tests${subject ? ` for “${subject}”` : ''}: they check the code still behaves correctly after changes.`;
  } else {
    purpose = KNOWN_FILES.find(([re]) => re.test(name))?.[1] ?? '';
    if (!purpose) purpose = NAME_ROLES.find(([re]) => re.test(stem))?.[1] ?? '';
    if (!purpose && file.role === 'source' && /^[A-Z][A-Za-z0-9]+$/.test(stem) && /\.(tsx|jsx|vue|svelte)$/.test(name)) {
      purpose = 'A UI component: a reusable piece of the interface.';
    }
    if (!purpose && file.role === 'docs') purpose = 'Documentation for the project.';
  }

  const details: string[] = [];
  const group = model.groupIndex.get(file.group);
  const folder = group ? purposeOf(group.key, [file]) : '';
  if (!purpose) {
    // No naming convention matched: describe it through its folder instead.
    purpose = group ? `Part of ${group.label}. ${folder}` : 'A file in this project.';
  } else if (group) {
    details.push(`Lives in ${group.label}: ${folder.replace(/^./, (c) => c.toLowerCase())}`);
  }

  if (file.dependents.length >= 3) {
    details.push(`A shared building block: ${file.dependents.length} other files import it, so changes here have a wide impact.`);
  } else if (file.deps.length >= 3 && file.dependents.length === 0) {
    details.push(`An orchestrator: it pulls together ${file.deps.length} other files but nothing imports it.`);
  } else if (file.degree === 0 && (file.role === 'source' || file.role === 'test')) {
    details.push('Stands on its own in this sample: no imports to or from other sampled files.');
  }
  if ((file.role === 'source' || file.role === 'test') && file.complexity >= 40) {
    details.push(`Branch-heavy (complexity ${file.complexity}): lots of if/else and loops, a good place to look for bugs or refactors.`);
  }
  if (file.concurrency > 0) {
    details.push(`Uses async / concurrency (${file.concurrency} markers): it waits on I/O or coordinates work happening in parallel.`);
  }
  return { purpose, details };
};
