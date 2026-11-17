# Sonyx 🎼

**Live codebase-to-symphony & 3D architecture synthesizer — built for DurHack.**

Paste any public GitHub repo URL. Sonyx turns its directory structure, static complexity metrics and import graph into an interactive real-time 3D WebGL sculpture you can orbit, zoom and click like an instrument, paired with a live, scale-quantized multi-track electronic composition.

Analysis events stream over WebSockets into a **Tone.js** engine that composes in **D Dorian** (`D E F G A B C`): chord progressions, voice-led pads and chord-aware melodies, so every codebase sounds musical rather than random.

## What you get

- **Three views of the same repo.**
  - *Code City*: one connected city. Directories are districts packed along a street grid with lane markings and streetlights. Gaps become parks with trees, and a river runs through the middle with bridges where the streets cross it. Files are buildings with lit windows (height = size), and imports are glowing arcs.
  - *Galaxy*: directories are suns with coronas, and files orbit them as planets (size = connectivity), all above a slowly turning spiral galaxy with nebulae and an asteroid belt.
  - *Code Tree*: the repo is the trunk, directories branch off it, files grow as leaves, and root-level files sit around the base like roots. It stands on a glowing forest floor with mushrooms and flowers, under a moon, with fireflies and falling petals.
- **Shapes by file role.**
  - In the City, a source file's building depends on its complexity: a low-rise block (simple), an office with setbacks (moderate), a tower with an antenna (complex) or a tapered spire skyscraper (very complex). Files that use concurrency get a rooftop beacon.
  - Also in the City: modules are landmark towers with a halo ring, tests are research labs with a rooftop dish, docs are libraries with a pediment, and config files are utility houses with pyramid roofs.
  - In the Galaxy: rocky, ocean and gas-giant planets with atmospheres (rings for async code, moons for complex code), ringed gas giants with moons for modules, space stations for tests, ice crystals for config and cratered moons for docs.
  - In the Tree: leaf clusters, glowing fruit, crystals, flowers and buds.
- **Metric overlay.** Colour by complexity, file size, dependencies or concurrency (teal → sky → lavender → pink).
- **Music that fits together.** Chord progressions and chord-aware melodies stay in D Dorian, scheduled on `Tone.Transport`. There are seven presets: **Ambient** (default), **Lo-fi**, **Cinematic**, **Electronic**, **Techno**, **Deep House** and **Synthwave**.
- **Built-in instruments, all synthesised (no samples to download or license).**
  - 11 lead voices: glass, pluck, electric keys, mallet, bright, supersaw, kalimba, organ, flute, chip and bell.
  - 909-style kick with sub rumble, claps, open/closed hats, a TB-303-style acid bassline, chord stabs, sidechain pumping, and a riser and crash for drops.
- **Never quite the same.**
  - Each repo gets its own chord progression and instrument line-up, chosen from its name.
  - Every loop of the tour moves the instruments to different directories.
  - Drums alternate between patterns with fills every 8 bars.
  - Techno and house build to a breakdown → riser → drop every 32 bars.
- **Picture and sound in sync.** A file pulses when its note plays. Directory hubs glow on chord changes and the ground pulses on the kick. When the melody follows an import, a light travels along that cable.
- **Guided tour.** The camera moves from an overview through each directory to the most connected hub, following the composition, and layers join as it goes. On desktop, a tour card shows which stop you're on and how far through the stop the music is. Use its ‹ › buttons or stop dots, or `←` `→`, to jump between stops. On phones the card is hidden, and the bottom bar has the tour controls.
  - Dragging, pinching or scrolling the view pauses the tour, but a plain tap doesn't.
  - Tapping a building to inspect it pauses the tour so the camera stays put.
  - Pausing the music pauses the tour, and resuming the tour restarts the music.
  - When you exit, the camera glides back out to the whole scene.
- **Works on phones.** On small screens the 3D view fills the screen. The top bar shrinks to one line once a repo is loaded, and a bottom bar holds play, the tour and View / Music / Code DNA tabs that open as sheets. The layout respects notches and home-indicator areas, and works in landscape. Touch devices also render at a lower pixel ratio without MSAA to keep the frame rate up.
- **Shortcuts.** `Space` play/pause · `1` `2` `3` switch views · `T` start or pause the tour · `←` `→` move between tour sections · `Esc` deselect, or exit the tour. Hovering a shape shows a tooltip. Links like `?repo=owner/name` pre-fill the repo.
- **File inspector.** Click a building to see **what it's for**: an explanation based on naming conventions, its folder, how connected it is, its complexity and its concurrency (`model/explain.ts`; it sits behind a `FileExplainer` interface so an AI explainer such as Gemini can replace it later). It also shows stats and connections, explains how the file shapes the music, and can play the file's musical signature.
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

## Leaderboard

`/ranking.html` ranks every repository composed on the site by its Code DNA (the five 0–1 axes shown on the main page). The overall score is their mean × 100, and the page can sort by any axis, stars or recency. It updates live: when anyone finishes a composition, the browser posts the scores to `POST /api/rankings`, and open leaderboards get a Server-Sent Event (`/api/rankings/stream`) and refresh. Clicking a repo opens `/?repo=owner/name` on the composer with a one-click ▶ Compose button (audio needs a user gesture).

* Storage: PostgreSQL/TimescaleDB (Tiger Data in production). Every run is appended to `repo_analyses` (a hypertable on `analyzed_at` when TimescaleDB is present); the board shows each repo's latest run. The table is created automatically.
* Only repos this server analysed in the last 30 minutes are accepted, and stars / file counts come from the server, not the client.
* If the database is unreachable the composer keeps working; the leaderboard shows an error.

Database settings (env vars): `DATABASE_URL` — paste Tiger Data's connection string as-is (`postgres://tsdbadmin:<password>@<host>:<port>/tsdb?sslmode=require`; credentials are taken from it), or use a `jdbc:postgresql://…` URL together with `DATABASE_USER` / `DATABASE_PASSWORD`.

## Gemini explanations (optional)

The file inspector can ask Google Gemini to explain a file. Click a building, then press **✨ Explain with Gemini**. Once Stripe billing is configured this becomes a Sonyx Pro feature (see below).

How it works:
- The browser calls our backend (`POST /api/explain`).
- The backend downloads the file from GitHub and sends it to Gemini with the API key.
- The answer replaces the built-in explanation. If Gemini isn't configured, is over quota or fails, the built-in explanation stays.
- **The key never reaches the browser.**

Setup (locally):
1. Create a free API key at [Google AI Studio](https://aistudio.google.com) → API keys. Use a project **without billing** so it stays on the free tier.
2. Copy `backend/.env.example` to `backend/.env` and paste your key after `GEMINI_API_KEY=`. That file is git-ignored, and the backend reads it on every start, so there's nothing to export in each terminal.
3. Optional: `GEMINI_MODEL=...` in the same file (default `gemini-3.5-flash-lite`). Use any model listed in AI Studio, ideally a Flash or Lite one with a generous free limit.
4. Start the backend. It logs `Gemini explanations enabled (model …)` or tells you the key is missing.

Setup (server): add `GEMINI_API_KEY=...` (and optionally `GEMINI_MODEL=...`) to `/opt/sonyx/.env`, next to the compose file, then run `docker compose up -d`.

Protecting the free quota:
- Gemini is only called when you press the button.
- Answers are cached per file on the server and in the browser.
- The server allows at most `GEMINI_MAX_PER_MINUTE` (default 15) requests per minute.

`GET /api/explain/status` shows whether Gemini is enabled and which model is used.

## Accounts and Sonyx Pro (optional)

Sonyx works with no accounts at all. Two optional features turn it into a product you can publish:

- **Sign in with GitHub.** Accounts are stored in the same Postgres database as the leaderboard (`app_users` table, created automatically).
- **Sonyx Pro**, a monthly subscription paid through **Stripe Checkout**. Stripe hosts the card form, so card details never touch our server.

| | Free | Pro |
|---|---|---|
| Any public repo, all views and music styles, leaderboard | ✓ | ✓ |
| ✨ Gemini file explanations | | ✓ |
| Source files analysed per repo | 48 | 120 |
| 🔒 Your private repositories | | ✓ |
| 🎬 Video clips with music | | ✓ |

Each feature switches on only when its keys are set:

- **No GitHub OAuth keys:** there is no sign-in button.
- **No Stripe keys:** billing is off and every Pro feature is free for everyone. That's how local dev and the DurHack demo behave.

How it fits together:
- Spring Security handles the GitHub login (`/oauth2/authorization/github`) and keeps a session cookie.
- `GET /api/me` tells the frontend who is signed in and on which plan.
- `POST /api/billing/checkout` creates a Stripe Checkout session.
- `POST /api/billing/portal` opens the Stripe Customer Portal, where users can change their card, see invoices or cancel.
- Stripe tells us about subscription changes through a signed webhook (`POST /api/stripe/webhook`). The plan is never trusted from the browser.
- All state-changing API calls are CSRF-protected (cookie `XSRF-TOKEN` → header `X-XSRF-TOKEN`). The Stripe webhook is exempt but signature-checked.

### Private repositories (Pro)

Pro users can pick **🔒 Connect private repos** in the account menu:
- This re-runs GitHub sign-in with the extra `repo` scope, through `/oauth2/authorization/github?private=1`. Normal sign-in only asks for the public profile. GitHub OAuth apps have no read-only scope for private repos, so the consent screen says read and write. Sonyx only reads.
- The token is kept in the user's HTTP session, and never in the database or logs. Signing out, a restart or **Disconnect** forgets it, and users can also revoke it on GitHub (Settings → Applications).
- The token is only used for that user's own analyses and Gemini explanations.
- Private repos are never sent to the leaderboard. Share links, badges, embeds and battles are hidden for them, and their Gemini answers are never cached for other users.
- No extra setup is needed: the same OAuth app and callback URL work.

### 1. GitHub OAuth app

Create one at GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App. Make two apps, because each app has a single callback URL:

| | Homepage URL | Authorization callback URL |
|---|---|---|
| Local dev | `http://localhost:5173` | `http://localhost:5173/login/oauth2/code/github` |
| Production | `https://<your-domain>` | `https://<your-domain>/login/oauth2/code/github` |

Put the client ID and a generated client secret in `backend/.env` (local) or `/opt/sonyx/.env` (server):

```
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### 2. Stripe

1. In the [Stripe dashboard](https://dashboard.stripe.com), stay in **Test mode** at first.
2. **Product catalogue → Add product:** "Sonyx Pro" with a **recurring** monthly price. Copy the price ID (`price_...`).
3. **Settings → Billing → Customer portal:** activate it, and allow customers to cancel and update payment methods.
4. **Developers → API keys:** copy the secret key (`sk_test_...`).
5. Set up the webhook:
   - **Locally**, with the [Stripe CLI](https://docs.stripe.com/stripe-cli), run:

     ```bash
     stripe listen --forward-to localhost:8080/api/stripe/webhook --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,checkout.session.completed,checkout.session.async_payment_succeeded
     ```

     It prints a `whsec_...` signing secret.
   - **In production**, go to Developers → Webhooks → Add endpoint and enter `https://<your-domain>/api/stripe/webhook` with these events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` (Pro) and `checkout.session.completed`, `checkout.session.async_payment_succeeded` (shop). Copy its signing secret.
6. Add to the env file:

   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_LABEL=£4.99/month
   APP_BASE_URL=https://<your-domain>
   # Optional: shop currency (default gbp)
   SHOP_CURRENCY=gbp
   ```

7. To test, sign in, open **Upgrade to Pro** and pay with the card `4242 4242 4242 4242` (any future date, any CVC). You return to Sonyx and the account menu shows **PRO** once the webhook arrives, which takes a few seconds.

Going live means switching the dashboard to live mode, creating the product, price and webhook again there, and replacing the three keys with live ones.

Before charging real customers:
- Publish terms of service and a privacy policy, and link them from Stripe's public business details.
- Fill in the Stripe account's business details.
- Decide on tax: Stripe Tax can calculate VAT.

Notes:
- Sessions are kept in server memory, so a restart signs everyone out. Subscriptions are safe in the database and Stripe.
- `ALLOWED_ORIGINS` (comma-separated) is only needed if another site must open the WebSocket. Same-origin always works.

## Sonyx Shop (cosmetics)

People can make Code City their own, and support the project, with one-time purchases. Open it with **🛍️ Shop** in the top bar. Every item can be tried on live before buying.

| Kind | Items (price) |
|---|---|
| **Skins**: materials, colours, windows | Neon (free) · Cyberpunk £1.99 · Gold Rush £1.99 · Glacier £1.99 · Volcanic £2.49 · Matrix, with falling code, £2.49 · Candy £1.49 |
| **Buildings**: architecture | Classic Skyline (free) · Future City £2.99 · Kingdom £2.99 · Pagoda £2.99 |
| **Worlds**: sky, ground, water, trees, weather | Night City (free) · Synthwave Sunset £2.49 · Arctic Aurora £2.49 · Neon Rain £2.49 · Desert Dusk £1.99 · Sakura Spring £1.99 · Lunar Base £2.99 |
| **Bundle** | Everything Pack £9.99 |

How it works:
- **Prices live on the server** in `backend/.../shop/ShopCatalog.java`. The browser only sends an item id, so nobody can change what they pay. Change prices or add items there. Their visuals live in `frontend/src/cosmetics/catalog.ts`, under the same id.
- **Buying** opens Stripe Checkout as a one-time payment. The item is granted only when Stripe's signed `checkout.session.completed` webhook says the payment went through. Repeated webhooks are harmless.
- **Your chosen look** is saved per account, so it follows you across devices. Signed-out visitors can use the free items, and their choice is kept in that browser.
- **Demo mode:** without `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, everything is unlocked for everyone.
- **Currency** is `SHOP_CURRENCY` (default `gbp`).
- **Fair play:** looks are cosmetic only. They never change how code is analysed, scored or ranked.

## Sonyx Wrapped

`/wrapped.html?u=<github-username>` turns a GitHub profile into a short music story:
- top languages shown as genres
- the most-starred repo as "your biggest hit"
- this year's activity, a persona, a tempo and a key
- a generated soundtrack in that key
- a share card (1080×1350 PNG) and a link that opens the hit repo in Sonyx with the matching music style

Details:
- It uses public data only: `GET /api/wrapped/{login}` reads the profile and public repositories through the GitHub API (set `GITHUB_TOKEN` for higher rate limits) and caches each result for an hour.
- Entry points: the landing page link, and **🎧 Your Sonyx Wrapped** in the account menu.

## Sharing: README badges and link previews

Every repo gets a README badge and a share link:

```markdown
[![Listen on Sonyx](https://<your-domain>/badge/facebook/react.svg)](https://<your-domain>/r/facebook/react)
```

- `/badge/{owner}/{repo}.svg` shows the repo's Code DNA score and leaderboard rank, or "▶ listen" before its first analysis. It is cached for an hour.
- `/r/{owner}/{repo}` and `/w/{login}` are share links. Chat apps and social sites read their Open Graph and Twitter tags (title, description, a 1200×630 preview image from `/og/...png`). People who click are sent straight to the music or to Wrapped.
- In the app, the Code DNA panel has **↗ Share** (it uses the phone's share sheet, or copies the link) and **🏷️ README badge** (copy-paste Markdown).
- Preview images are drawn on the server with Java2D. The Docker image installs DejaVu fonts for that.

## Repo Battles

`/battle.html?a=owner/repo&b=owner/repo` puts two codebases head to head:
- Both repos are analysed side by side in the browser, using the same pipeline as the composer, and both results go to the leaderboard.
- The page shows the two Code DNAs overlaid on one radar, round-by-round bars for each axis, and a verdict.
- Visitors vote on which one they'd rather listen to. That's one vote per visitor per battle, identified by an anonymous cookie that is stored hashed, and voting again changes your vote. Votes live in the `battle_votes` table.
- The 30-day most-voted battles are listed as "Popular battles".
- Entry points: the landing page, and **⚔️ Battle** next to Share in the Code DNA panel (it pre-fills the current repo).

## History time-lapse

**⏳ Time-lapse** (under Guided tour) replays how the city grew:
- Sonyx samples 12 commits evenly across the default branch's whole history.
- Each building appears when its file was created and grows to its size at each moment. The panel shows the date, the file count and that moment's commit message, with play/pause and a scrubber.
- `POST /api/history` takes `{repo, paths, points}`. It only reports sizes for the files currently drawn, so the response stays small even for huge repos. It costs about 26 GitHub requests, and public results are cached for six hours.
- Private repos use the user's own token and are not cached.

## Embeddable player

Any repo can be embedded in docs, blogs or portfolios. Use **</> Embed** next to Share to copy the code:

```html
<iframe src="https://<your-domain>/?repo=facebook/react&embed=1" width="720" height="420"
        style="border:0;border-radius:12px" allow="autoplay; fullscreen" loading="lazy"></iframe>
```

- With `?embed=1` the app shows only the 3D scene and a compact player bar: play/pause, City/Galaxy/Tree, and **Open ↗**.
- No account, shop or payment controls appear in embeds.
- Only embed URLs may be framed by other sites. Every other page sends `X-Frame-Options: DENY`, which protects against clickjacking.

## Running locally

Quickest — everything in Docker (TimescaleDB + app; no Java or Postgres install needed):

```bash
docker compose -f docker-compose.dev.yml up --build
```

Composer: http://localhost:8080 · Leaderboard: http://localhost:8080/ranking.html. For frontend hot reload, keep that running and also run `cd frontend && npm install && npm run dev`, then open http://localhost:5173 (Vite proxies `/ws` and `/api` to port 8080).

Without Docker for the backend:

Prerequisites: **Java 21+** and **Node 20+** (Maven not needed — the wrapper downloads it), plus a PostgreSQL on `localhost:5432` (database `codefugue`, user/password `postgres`) for the leaderboard.

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
   ssh root@<ip> 'curl -fsSL https://get.docker.com | sh && ufw allow 80/tcp && ufw allow 443/tcp && mkdir -p /opt/sonyx'
   ```

3. Build an amd64 image locally and ship it (the box is too small to build on):

   ```bash
   docker buildx build --platform linux/amd64 -t sonyx-app:amd64 --load .
   docker save sonyx-app:amd64 | gzip | ssh root@<ip> 'gunzip | docker load'
   scp deploy/docker-compose.server.yml root@<ip>:/opt/sonyx/docker-compose.yml
   scp deploy/Caddyfile root@<ip>:/opt/sonyx/Caddyfile
   ```

4. On the server, create `/opt/sonyx/.env` (mode 600) and start:

   ```bash
   DOMAIN=<ip-with-dashes>.nip.io
   GITHUB_TOKEN=ghp_your_token_here
   # Leaderboard database (Tiger Data service)
   DATABASE_URL=postgres://tsdbadmin:<password>@<host>:<port>/tsdb?sslmode=require
   # Optional: Gemini file explanations (free key from aistudio.google.com)
   GEMINI_API_KEY=your_key_here
   # Optional: accounts and payments, see "Accounts and Sonyx Pro"
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_LABEL=£4.99/month
   APP_BASE_URL=https://<ip-with-dashes>.nip.io
   ```

   `cd /opt/sonyx && docker compose up -d`, then open `https://<ip-with-dashes>.nip.io`. To update, repeat step 3 and run `docker compose up -d` again.

Local smoke test of the same stack: `DOMAIN=http://localhost docker compose up --build`, then open http://localhost.

## Project layout

```
backend/src/main/java/com/sonyx/backend/compose/
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
- Record/export the performance (Tone.Recorder → WAV)
- Smarter import resolution (relative path resolution, tsconfig paths, Java packages)
