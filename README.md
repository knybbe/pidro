# Pidro

Browser card game: **Finnish Pidro** (solo vs robots). Mobile-first PWA, hostable on **GitHub Pages**.

## Play

```bash
npm install
npm run dev
```

Open the URL Vite prints (with base path `/pidro/`, e.g. `http://localhost:5173/pidro/`).

```bash
npm test          # engine unit tests
npm run build     # production build → dist/
npm run preview   # preview production build
```

## Rules (summary)

- 4 players, fixed partnerships: **You + North** vs **West + East**
- Deal 9, bid **6–14**, high bidder names trump
- Left pedro (same-color 5) is also trump; **14 points** in the pack
- Discard non-trumps, refill to 6; **only trumps are played**
- Make bid → score points taken; fail → **−bid**. First to **62** wins

In-app **How to play** has the full summary.

## Robots

Lobby: set **easy / medium / hard** independently for West, North (partner), and East.

## Deploy (GitHub Pages)

1. Create a GitHub repo named **`pidro`** (or change `base` in `vite.config.ts` to match).
2. Push this project to the repo.
3. **Settings → Pages → Source**: GitHub Actions.
4. Push to `main` (or run the **Deploy to GitHub Pages** workflow).

Site URL: `https://<user>.github.io/pidro/`

> No backend, login, or multiplayer in this version — pure client-side solo play (works offline after first load via the service worker).


## Multi-machine sync

Pidro can keep match history in sync across devices **without a backend** by mapping a shared folder (e.g. inside OneDrive, Google Drive, Dropbox, or iCloud Drive):

1. Open **Match History** (or the lobby sync panel) → **Map sync folder**.
2. Pick a folder your cloud client syncs. Pidro creates a `pidro/` subfolder with:
   - `history.json` — match history (`version`, `updatedAt`, `games[]`)
   - `prefs.json` — optional lobby prefs
   - `current-game.json` — optional in-progress match snapshot
3. On another machine, map the **same** folder. On startup and window focus, Pidro merges histories.

**Merge rule:** last-write-wins per game `id` using each record’s `updatedAt`. Newer data is never blindly wiped by older copies.

**Browser support:** Chromium (Chrome/Edge) and desktop Safari support the File System Access API. **iOS Safari** and some browsers do not — Pidro keeps using `localStorage` there and shows a clear unsupported status. Directory handles are stored in IndexedDB and re-authorized when the browser requires it.

History is always written through the same pipeline (localStorage + optional folder mirror). Save failures (e.g. `QuotaExceededError`) are surfaced in the UI instead of failing silently. Snapshots are compacted to reduce quota pressure; the in-browser list keeps up to 50 games.

## Stack

- Vite + React + TypeScript
- Zustand (game UI state)
- Vitest (engine tests)
- vite-plugin-pwa (installable / offline)

## Project layout

```
src/engine/   pure Pidro rules & state machine
src/ai/       easy / medium / hard bots
src/store/    React store + bot turn loop
src/components/  mobile-first lobby & table
```
