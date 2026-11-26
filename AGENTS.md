# Template PWA Agent Notes

## Template lifecycle

- This repository is a starter template, not the user's finished application. Nothing from the template must be preserved for its own sake.
- Replace or remove any starter code, demo feature, page, styling, branding, schema, dependency, tool, or documentation when the user's application needs something else.
- The rules below describe the current starting point. They do not require keeping template features or architecture after the user asks to change them.
- Once the user starts requesting application features, update every affected `AGENTS.md` in the same change. Keep a concrete inventory of what is still template material and what is now the user's application, using file paths or feature names.
- Review that inventory after each feature request. Move adapted or replaced parts into the application inventory and remove stale template instructions. Do not describe the user's completed features as demos.
- When no template material remains, remove all template-specific instructions, inventories, and template wording from every `AGENTS.md`. Keep useful application instructions and describe only the user's application.

## Current ownership

- User application: **Wobble Hoops**, a one-button pixel basketball game (1 player vs computer, 2 players on one
  keyboard, and online play with a 4-character room code). All on-screen text is English.
  - Game page at `/`: `frontend/src/pages/GamePage.tsx` (+ test).
  - Game code (plain JavaScript modules): `frontend/src/game/` — `sim.js` physics and rules (uses the `planck`
    package), `render.js` canvas drawing and on-screen text, `game.js` menu, controls, game loop and online play,
    `sound.js` sounds (generated, plus the `sounds/uwu.mp3` file), `p2p.js` direct WebRTC connection between host and
    guests (snapshots on an unreliable "fast" channel, inputs on a "sure" channel; setup via `{t: 'rtc'}` through
    `/ws/game`; public Google STUN server; falls back to the server websocket), `ticker.js` worker timer that keeps
    the host running in a hidden tab, `game.css` panels, `fonts/` the Press Start 2P pixel font (SIL Open Font License).
    Unit tests: `sim.test.js`, `render.test.js`, `combos.test.js`, `party.test.js`, `bot.test.js`.
  - Strong computer player for 1 PLAYER mode: `frontend/src/game/bot.js` (`createSmartBot`). It looks ahead in a copy
    of the game (`saveState` / `loadState`): with the ball it tries throw timings until one goes in, without the ball
    it tries jump timings (for either player or both) until one gets the ball. When it starts thinking it rebuilds the
    real game from its own save, so the copy matches exactly. `update()` returns one button per player: each computer
    player has its own button (`Game.setPlayerKeys`), the human's two players share one. The simple `Sim.Bot` still
    plays the menu demo.
  - 1 PLAYER handicap: `new Sim.Game({ hoopShrink: [HUMAN_HOOP_SHRINK, 0] })` in `game.js` (1 px). `hoopShrink[team]`
    makes the hoop that team shoots at smaller by hitboxes (rim fixtures reach further in, narrower scoring check);
    it is drawn the same. Measured: 1 px cuts human-like baskets by ~30%, 2 px by ~70%.
  - Online netcode (rollback): the host runs the real game and sends `game.saveState()` 30 times a second. A guest
    keeps its own copy (`lg` in `game.js`), loads each host state and replays its own button presses on top, so its
    player reacts at once. Guests send button changes with the tick they are meant for (`at`); the host applies them
    on that tick. Pings (`{t: 'ping'}`) and `sl` (slack) in snapshots keep each guest ~3 ticks ahead of the host.
    All randomness in `sim.js` comes from the game's own seed (`Game.random`), so replays match the host.
    `window.__wobble` exists only in dev (`import.meta.env.DEV`) for tests and debugging. E2E test: `frontend/tests/e2e/game.spec.ts`.
  - Secret key combos in `frontend/src/game/combos.js` (+ `combos.test.js`): Z + C is the cheat shot while your team
    holds the ball (`Game.cheatShot` in `sim.js`; the guest sends `{t: 'c'}`), Z + U plays `sounds/uwu.mp3` for both
    players (online each side sends `{t: 'u'}` to the other), Z + W starts 8 seconds of chaos (`Game.startChaos`
    in `sim.js`, crowd and spinning in `Renderer.chaosCrowd` / `draw` in `render.js`; the guest sends `{t: 'x'}`,
    snapshots carry `x: [seconds, seed]`), Z + S stops a flying ball so it falls straight down (`Game.stopBall`;
    the guest sends `{t: 'd'}`), Z + T stands players up straight (`Game.stabilize(team, only)` and the `steady`
    timer in `step()`; online only the presser: duo guest -> team 1, party -> just that player; the guest sends
    `{t: 'g'}`). During chaos `Game.shownScore()` returns random numbers; the real
    `game.score` is not changed.
  - All combos are locked until the player presses 1 four times in the first 5 seconds of a match
    (`createCheatUnlock` in `combos.js`, started in `startLocal` / `peer-joined` / `joined`, reset in `toMenu`).
    It is a client-side rule only; the server does not check it.
  - Each team's score box is on its own side (team 0 left, team 1 right).
  - Boosts (power-ups): rules in `frontend/src/game/boosts.js` (+ `boosts.test.js`): kinds, spawn timing (one every
    5-10 s, at most 2 on court, 10 s life), pickup by touch, effect timers in `player.fx`. `sim.js` applies them
    (jump power, sideways jump, arm speed, arm length, freeze = no button) and saves them in `saveState`, so online
    and the bot see them. Drawing: `drawItems`, `fxIcons`, `iceBlock`, sparks and rising names in `render.js`;
    pickup events are `boost:<kind>:<player>:<x>:<y>`. Turned on per game with `new Sim.Game({ boosts })`; the
    setting is the menu BOOSTS button / online-panel checkbox (`boostsOn` in `game.js`, saved in localStorage).
  - Big balls: `hoopBonus` on a ball widens the hoop opening for that round (beach ball +6 px; it was 13 px wide in a
    13.5 px gap and almost never went in).
  - Online rooms: `backend/game/rooms.py` (in-memory rooms) and `backend/game/routes.py` (public websocket
    `/ws/game`, no login). Tests: `backend/tests/test_game.py`.
  - Party rooms (2-8 players, uneven teams allowed): the server keeps a player id per guest (`create-party`, `join`
    with `name`, `p-join` / `p-left` to the host, `lock` after start; guest messages reach the host with `from`).
    The host (admin) keeps the player list in `frontend/src/game/party.js` (+ `party.test.js`), sends `lobby` and
    `start` to everyone, and runs the game with `new Sim.Game({ teams })` and one button per player
    (`Game.setPlayerKeys`). Round configs carry `teams`, so guests build the same players. Lobby UI is the `p-party`
    card in `GamePage.tsx`; the e2e party test is in `game.spec.ts`.
  - App name, PWA manifest, and icon (`frontend/public/icon.svg` and generated icons).
- Remaining template: demo login/admin accounts, the login/dashboard/admin pages and their shared layout, notes,
  the logged-in `/ws` socket example, migrations, their tests, development helpers, and deployment examples.
  The game does not use them. Remove them when the student decides the game does not need accounts.
- On-screen game text is drawn with the pixel font: every letter is as wide as the font size. Use `fitSize` and
  `wrapParts` from `frontend/src/game/render.js` for long labels, so they never run off the screen or overlap.

## Working defaults

- The main user of this template is a school student who does not understand the technology deeply yet.
- Keep the template small and easy to read.
- Prefer the simplest working design over clever abstractions.
- Prefer explicit functions, explicit SQL, and explicit routes.
- Do not add heavy frameworks or hidden magic.
- Keep the current simplified web model unless the user asks for an architecture change:
  - production is same-origin behind nginx or Traefik;
  - dev-only CORS is for localhost splits;
  - browser API calls stay POST-based for this template.
- Keep production routing path-based for this template:
  - JSON endpoints live under `/api/...`;
  - websocket stays at `/ws`;
  - reverse proxy should send `/api` and `/ws` to backend and everything else to frontend.
- Keep all user-facing text in simple English.
- When adding backend DB code, place SQL only under `backend/db`.
- When adding frontend pages, keep routing and auth flow direct and beginner-friendly.
- Cover new behavior densely with tests: backend unit tests, frontend unit tests, and Playwright e2e tests where the
  feature crosses the browser boundary.
- Before calling any task done, run the full test suite (`make test`) and make sure every test passes.
  If a test breaks, fix it — do not skip or delete it.
- For auth, routing, cookies, WebSockets, startup, and other browser-sensitive flows, do not stop at tests. Also verify
  the real running app in a live browser session.
- After frontend, auth, routing, cookie, or WebSocket changes, verify the result in a live browser session, not only
  with tests.
- During that live check, look for browser console errors, failed network requests, cookie problems, and broken
  redirects before calling the task done.
- When local dev servers are already running, prefer checking the real dev app first and use tests as a second line of
  verification.
- For live checks, use the Playwright MCP server from the root `.mcp.json` (Claude Code and other MCP clients load it).
  Point it at the hidden agent runtime (`make aback` + `make afront`, URL from `.agent.env`). Use `make abrowser` for
  repeatable scripted checks. If the MCP browser cannot start, the student may need Google Chrome installed.
- The app icon lives in `frontend/public/icon.svg`. Once the student's app idea is clear, follow
  `frontend/icon/AGENTS.md` to draw a matching icon and regenerate favicon and phone icons.
- Every source file should start with a short plain-English header comment or docstring that explains what the file
  does.
- That file header should also say when the file should be edited, and whether it can be copied as a starting point for
  adding a new table, endpoint, page, test, or similar feature.
- Use module docstrings for Python files.
- Use short top-of-file comments for TS, TSX, JS, CJS, CSS, HTML, env examples, TOML, and the Makefile when the file
  format allows comments.
- If the file format does not support comments cleanly, skip the header instead of breaking the file.
- Keep every file header short. Answer only: what this file does, when to edit it, and when to copy it.
- When a student adds a new feature, prefer the pattern: route -> db/helper file -> page/component -> unit tests ->
  e2e test if the browser flow changed.
- Extend an existing file only when the new code belongs to the same small feature block. Start a sibling file when the
  new code would make the old file feel crowded or mixed.
- Add Python packages with `uv add` for runtime deps and `uv add --dev` for dev-only deps.
- Add frontend packages with `npm install` for runtime deps and `npm install -D` for dev-only deps.
- Do not edit dependency lists by hand unless there is a strong reason and it is explained.
- Student-facing configuration belongs only in the root `.env` and `.docker.env` files.
- Do not add new user-tuned ports, URLs, secrets, modes, or project names to `Makefile`, compose files, Playwright configs, or Dockerfiles.
- Hidden agent-only configuration belongs in the root `.agent.env` file.
- Treat `.claude/launch.json` as a local generated preview file. If needed, generate it from `.agent.env` and use the hidden runtime commands; do not commit a second set of ports or URLs.
- When normal human local ports are busy, prefer the hidden agent runtime instead of changing the student-facing commands.
- Hidden agent runtime commands:
  - `make aback`, `make aback-once`, `make afront`, `make aopen`, `make astop`, `make aclean`
  - `make abrowser SCRIPT=path/to/scenario.mjs`
  - `make alogin USER=user PASS=user`
  - `make apost API_PATH=/api/... BODY='{}'`
  - `make ahealth`, `make asql SQL='select ...'`, `make adb-path`
- `aback` and `aback-once` must always recreate the hidden agent DB from the normal local DB before startup.
- Hidden agent runtime files live under `.agent/`.
- Keep `.docker.env` as the Docker config filename for this repo. Do not rename it to `.env.docker` unless the user explicitly asks.
- Keep the base `docker-compose.yml` platform-safe for `tlfpaas`:
  - no `ports:`
  - no local-only `build.args`
  - no Compose `user:`
  - no external networks or volumes
  - route-target services use `tlfpaas.route`
- Keep local Docker-only browser behavior in `docker-compose.local.yml`, not in the base compose file.
- Keep `frontend` on exposed port `8080`, `backend` on exposed port `8081`, backend APIs under `/api/...`, and WebSocket
  under `/ws` unless the routing model is intentionally changed everywhere.
- Keep runtime Docker images non-root by using `USER` in the final Dockerfile stage, not by adding Compose `user:`.
- Treat `COOKIE_SECRET` in `.docker.env.example` as a local placeholder only; real production secrets belong in the
  tlfpaas Secrets UI and require `Redeploy now`.
- Before changing Docker artefacts, read `docs/tlfpaas-autodeploy.md`.
- Keep LAN dev mode intentionally simple: prefer the explicit macOS Wi-Fi `en0` helper over generic network auto-detection.
- Keep LAN ports separate from the default localhost ports unless the user asks otherwise.
- Do not expand LAN mode into a multi-interface discovery system unless the user asks for broader network support.

## Deploy (tlfpaas)

- Students deploy with tlfpaas. Every push to GitHub starts a deploy through a GitHub webhook. There is no separate CI,
  so a push with broken code goes straight to the public app. Always run `make test` before `git push`.
- tlfpaas sets these runtime values itself: `APP_MODE=prod`, `DB_PATH=/data/app.sqlite3`,
  `FRONTEND_ORIGIN=https://<project host>`, `VITE_BACKEND_URL=/api`. Do not commit `.docker.env` to change them.
- Production needs two secrets in the tlfpaas Secrets page (https://deploy.tlfedu.tech/my/projects), followed by
  `Redeploy now`:
  - `COOKIE_SECRET` — a long random string (32+ characters);
  - `ADMIN_PASSWORD` — the password of user `admin` (12+ characters). The backend creates `admin` on startup and resets
    its password when this secret changes.
  The backend refuses to start in prod without good values. Never print, log, or commit secret values.
- Where to look when a deploy fails: the deploy log on the dashboard, runtime logs at https://logs.tlfedu.tech, and
  read-only files (including the SQLite file) at https://files.tlfedu.tech.
- Platform rules for Docker files: https://deploy.tlfedu.tech/guides/docker/agents and `docs/tlfpaas-autodeploy.md`.

