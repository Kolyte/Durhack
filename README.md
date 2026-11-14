# CodeFugue 🎼

**Live codebase-to-symphony & 3D architecture synthesizer — built for DurHack.**

Paste any public GitHub repo URL. CodeFugue turns its directory structure, static complexity metrics and import graph into an interactive real-time 3D WebGL sculpture you can orbit, zoom and click like an instrument, paired with a live, scale-quantized multi-track electronic composition.

Analysis events are streamed over WebSockets into a browser-based **Tone.js** synth ensemble locked to **D Dorian** (`D E F G A B C`), so every codebase sounds cohesive.

## Mappings

| Codebase metric | 3D visual | Music |
| --- | --- | --- |
| Directory hierarchy | Radial clusters / hubs (golden-angle spread) | Instrumentation & timbre grouping |
| File size (LOC) | Hexagonal tower height | Note duration (`4n` vs `8n`) |
| Cyclomatic complexity (`if`, `for`, `&&`, …) | Glow colour cyan `#00f5d4` → magenta `#ff006e` | Scale pitch & FM modulation index |
| Imports / dependencies | Curved glowing Bézier cables | Melodic path during the tour |
| Concurrency keywords (`async`, `Thread`, `Promise`, …) | Faster rotation | 16th-note sawtooth arpeggio |
| Repo stars | Pulse intensity | Master tempo (85–134 BPM) & kick |

### Synth ensemble (`frontend/src/audioEngine.ts`)
1. **Foundation pad** – `Tone.PolySynth`, warm triangle chords through reverb
2. **Melodic lead** – `Tone.FMSynth`, one bell tone per file; modulation scales with complexity
3. **Concurrency arpeggiator** – `Tone.MonoSynth`, filtered sawtooth for async-heavy files
4. **Percussion** – `Tone.MembraneSynth`, sub-bass kick on the beat grid

## Architecture

```
frontend (Vite + React 19 + R3F + Tone.js)  ──ws://localhost:8080/ws/compose──▶  backend (Spring Boot 4.1, Java 21)
                                                                                     │
        ◀── REPO_TREE → NODE_METRICS* → EDGE_FOUND* → COMPOSITION_READY | ERROR ──   ├─ GitHub API: repo meta + recursive tree (1 request)
                                                                                     └─ raw.githubusercontent.com: top 45 files, 12 at a time on virtual threads
```

1. Client sends `{ "repoUrl": "https://github.com/owner/repo" }`.
2. Backend emits `REPO_TREE` immediately (~300 ms) so the wireframe city appears at once.
3. It then scans the 45 largest source files concurrently, streaming `NODE_METRICS` and `EDGE_FOUND` as each finishes, then `COMPOSITION_READY`. The client starts the "composition tour".

Event shapes: `backend/.../compose/ComposeEvent.java` ⇄ `frontend/src/types.ts` — keep them in sync.

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

Tests: `cd backend && ./mvnw test` · Frontend type-check & build: `cd frontend && npm run build`

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
backend/   Spring Boot WebSocket server + GitHub analyzer
  src/main/java/com/codefugue/backend/compose/
    ComposeEvent.java        sealed event types streamed to the client
    FileNode.java            per-file metrics + 3D position
    GitHubAnalyzerService.java  fetch, layout, metrics, import resolution
    WebSocketConfig.java     /ws/compose handler
frontend/  Vite + React + TypeScript
  src/App.tsx               HUD, WebSocket client
  src/CodeSculpture.tsx     three.js scene (towers, cables, bloom)
  src/audioEngine.ts        Tone.js ensemble & composition tour
  src/types.ts              shared event/data types
```

## Ideas / next steps
- Map directory hubs to distinct instruments/timbres (currently only spatial)
- Pulse intensity from star count, beat-synced tower pulses
- Better import resolution (relative paths, Java packages, Python modules)
- Record/export the performance (Tone.Recorder → WAV)
- Use `Tone.Transport` scheduling instead of `setInterval` for tighter timing
