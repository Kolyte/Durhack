# CodeFugue 🎼

**Live codebase-to-symphony & 3D architecture synthesizer — built for DurHack.**

Paste any public GitHub repo URL. CodeFugue turns its directory structure, static complexity metrics and import graph into an interactive real-time 3D WebGL sculpture you can orbit, zoom and click like an instrument, paired with a live, scale-quantized multi-track electronic composition.

Analysis events stream over WebSockets into a **Tone.js** engine that composes in **D Dorian** (`D E F G A B C`): chord progressions, voice-led pads and chord-aware melodies, so every codebase sounds musical rather than random.

## What you get

- **Two views of the same repo.** *Code City*: directories are neighbourhoods, files are buildings (height = size), imports are glowing arcs. *Dependency Galaxy*: directories are stars, files orbit them as planets (size = connectivity).
- **Shapes by file role.** Source files are hex towers or crystals. Modules and entry points are spheres with rings. Config files are pyramids or octahedra. Tests are discs. Docs are small, soft shapes.
- **Metric overlay.** Colour by complexity, file size, dependencies or concurrency (teal → sky → lavender → pink).
- **Music that fits together.** Chord progressions and chord-aware melodies stay in D Dorian, scheduled on `Tone.Transport`. There are four presets: **Ambient** (default), **Lo-fi**, **Cinematic** and **Electronic**.
- **Picture and sound in sync.** A file pulses when its note plays. Directory hubs glow on chord changes and the ground pulses on the kick. When the melody follows an import, a light travels along that cable.
- **Guided tour.** The camera moves from an overview through each directory to the most connected hub, following the composition, and layers join as it goes. Dragging the view pauses the tour.
- **File inspector.** Shows stats and connections, explains how the file shapes the music, and can play the file's musical signature.
- **Code DNA.** Complexity, connectivity, modularity, concurrency and size, shown as a radar chart, with notes on what was sampled.
- **Playback dock.** Play/pause, mute, volume, tempo, reverb, energy, instrument toggles and preset selection, all applied live.

## How code becomes music

| Code characteristic | Musical influence | Visual |
| --- | --- | --- |
| File size (LOC) | Note length (eighths → held notes) | Building height |
| Complexity | Melodic leap size and brightness | Colour / glow (complexity overlay) |
| Imports | Melody moves by step between linked files, and a light travels the cable | Arcs / trails |
| Concurrency | Arpeggio activity (off → quarters → eighths → 16ths) | Ring spin speed |
| Directory | Which lead voice plays it (e.g. glass, pluck, mallet) | Neighbourhood / solar system |
| Repo size | Note density | — |
| Stars | Default energy (capped) | — |
| Code DNA connectivity | Richer chord extensions (9ths, 6/9s) | Cable density |
| Code DNA modularity | — | Spacing between clusters |

The piece is deterministic: the same repo always composes the same music, because the random generator is seeded from the repo name. The arrangement builds up over time: pad → lead (bar 2) → bass (bar 4) → arpeggio (bar 6) → drums (bar 8).

## Architecture

```
frontend (Vite + React 19 + R3F + Tone.js)  ──ws://localhost:8080/ws/compose──▶  backend (Spring Boot 4.1, Java 21)
                                                                                     │
        ◀── REPO_TREE → NODE_METRICS* → EDGE_FOUND* → COMPOSITION_READY | ERROR ──   ├─ GitHub API: repo meta + recursive tree
                                                                                     └─ raw.githubusercontent.com: files, 12 at a time on virtual threads
```

The backend samples the 48 largest source and test files, plus up to 8 config files and 6 docs. For each one it streams its role, size, complexity, concurrency markers and import count. It resolves imports to other sampled files by exact base name (`./router` → `router.js` or `router/index.js`, `com.a.UserService` → `UserService.java`). `REPO_TREE` also reports how many source files exist in total, so the UI can say how much was sampled.

Event shapes: `backend/.../compose/ComposeEvent.java` ⇄ `frontend/src/types.ts`. Keep them in sync.

## Running locally

Prerequisites: **Java 21+** and **Node 20+** (Maven not needed — the wrapper downloads it).

Backend (set a GitHub token for 5,000 req/hr instead of 60):

```bash
cd backend
export GITHUB_TOKEN=ghp_your_token_here   # Windows PowerShell: $env:GITHUB_TOKEN="ghp_..."
./mvnw spring-boot:run                     # Windows: mvnw.cmd spring-boot:run
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, then click **Compose** or a preset. Audio starts on that click (browsers block autoplay).


The frontend connects to `/ws/compose` on its own host; in dev, Vite proxies that to `localhost:8080`. Set `VITE_WS_URL` to override.

## Deploying on Vultr

One Docker image (Vite build bundled into the Spring Boot jar) behind Caddy, which gets a Let's Encrypt cert for a free `nip.io` hostname — so the demo is served over `https://` / `wss://`.

> `sslip.io` is blocked by the Durham University network's DNS; `nip.io` resolves fine there.

1. Create a Vultr Cloud Compute instance (Ubuntu 24.04 LTS, `vc2-1c-1gb` is plenty) with your SSH key.
2. Prepare it once:

   ```bash
   ssh root@<ip> 'curl -fsSL https://get.docker.com | sh && ufw allow 80/tcp && ufw allow 443/tcp && mkdir -p /opt/codefugue'
   ```

3. Build an amd64 image locally and ship it (the box is too small to build on):

   ```bash
   docker buildx build --platform linux/amd64 -t codefugue-app:amd64 --load .
   docker save codefugue-app:amd64 | gzip | ssh root@<ip> 'gunzip | docker load'
   scp deploy/docker-compose.server.yml root@<ip>:/opt/codefugue/docker-compose.yml
   scp deploy/Caddyfile root@<ip>:/opt/codefugue/Caddyfile
   ```

4. On the server, create `/opt/codefugue/.env` (mode 600) and start:

   ```bash
   DOMAIN=<ip-with-dashes>.nip.io
   GITHUB_TOKEN=ghp_your_token_here
   ```

   `cd /opt/codefugue && docker compose up -d`, then open `https://<ip-with-dashes>.nip.io`. To update, repeat step 3 and run `docker compose up -d` again.

Local smoke test of the same stack: `DOMAIN=http://localhost docker compose up --build`, then open http://localhost.

## Project layout

```
backend/src/main/java/com/codefugue/backend/compose/
  ComposeEvent.java           sealed event types streamed to the client
  FileNode.java               per-file metrics + role
  GitHubAnalyzerService.java  fetch, sample, classify, metrics, import resolution
  WebSocketConfig.java        /ws/compose handler
frontend/src/
  App.tsx                     wires stream → model → views/engine
  types.ts                    shared event/data types
  state/                      WebSocket hook, tiny store
  model/                      repoModel (groups, roles, degrees), codeDna
  audio/
    theory.ts                 D Dorian, chords, voice leading, seeded RNG
    presets.ts                Ambient / Lo-fi / Cinematic / Electronic
    composer.ts               pure: sections, melody, arps, mappings (unit tested)
    instruments.ts            Tone.js synths per preset
    AudioEngine.ts            Transport scheduling, mixing, live controls, visual sync
  visualization/
    CodeSculpture.tsx         the <Canvas>, lights, bloom
    layouts.ts                Code City + Dependency Galaxy positions
    CameraRig.tsx             orbit controls + guided tour
    pulseBus.ts               audio → visual pulses (no React re-renders)
    shapes/                   FileShape, DirectoryHub, DependencyCable
  components/                 RepoInput, PlaybackControls, ViewControls, FileInspector, MetricsPanel
```

Tests: `cd backend && ./mvnw test` · `cd frontend && npm test` (composer/model) · `npm run lint` · `npm run build`

## Ideas / next steps
- Code Tree view: the repo grows as an organic tree while analysis streams in
- Record/export the performance (Tone.Recorder → WAV)
- Smarter import resolution (relative path resolution, tsconfig paths, Java packages)
- Shareable links that auto-compose a repo (`?repo=owner/name`)
