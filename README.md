# Takes

A phone-first web app for sorting, listening to and annotating music demos.

- **Inbox**: one card per new recording. Swipe right for a song, left for a riff or idea, up to bin, down to skip for now. For a song, a sheet asks which song it's a take of (suggesting ones recorded in the same sitting) or starts a new one. For an idea, it suggests tags as chips and takes an optional status. Undo brings back the last card.
- **Songs**: grouped by status (working on, needs work, to revisit, done). A song holds its takes in rank order; drag them on the song's page to rank them, and add or take out takes there.
- **Ideas**: grouped by tag, filterable by status; an idea with several tags shows under each.
- **A take**: player with waveform, notes, timestamped markers, tags, status (ideas), and which song it's in.

Live at https://rossmclachlan.github.io/takes/ (add it to the home screen).

## How it fits together

```
Pixel Recorder ─ Google Takeout ─▶ NAS folder ─▶ takes-ingest ─▶ PocketBase ─(Tailscale Funnel)─▶ this app
```

- The backend is in [music-cms-mvp](https://github.com/rossmclachlan/music-cms-mvp): migrations `017_takes.js` and `018_takes_songs.js` (collections `demo_takes`, `demo_songs`, `demo_tags`, `demo_markers`) and the `takes-ingest` container, which converts recordings in the demos folder and adds them to the inbox. Originals are never changed.
- The app signs in with the same PocketBase `users` account as Nostalge and talks to `https://polky.tail9c3d82.ts.net:8443` (`tailscale serve` → PocketBase on 8095; 443 is the Nostalge MCP server) (override with the `VITE_POCKETBASE_URL` repo variable or a `.env`).
- It works offline: the library is kept in IndexedDB, changes queue on the phone and go up when the NAS is reachable (`src/lib/store.ts`), and the next 25 inbox takes are downloaded ahead (`src/lib/audioCache.ts`).
- Look: Homegrown, shared with Mise and Priorities (`src/brand.css` is a copy of Mise's `src/components/ui/brand.css`).

## Development

```bash
npm install
echo 'VITE_POCKETBASE_URL=http://<nas-ip>:8095' > .env.local   # or leave unset for the Funnel
npm run dev      # http://localhost:5173/takes/
npm test         # queue and grouping logic
npm run lint
npm run build
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`; Settings → Pages → Source must be "GitHub Actions").
