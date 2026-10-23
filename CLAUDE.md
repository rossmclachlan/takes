# Takes — project notes for Claude

- Backend lives in rossmclachlan/music-cms-mvp (`pocketbase/pb_migrations/017_takes.js`, `018_takes_songs.js`, `takes-ingest/`). Field changes go there first; keep `src/lib/types.ts` in step.
- PocketBase is 0.22 (JS SDK 0.21). A required number field rejects 0, and client-made ids must be 15 chars of [a-z0-9] (`newId()` in `src/lib/ops.ts`).
- All writes go through the change queue in `src/lib/store.ts` so they work offline. Don't call `pb.collection(...).update` from components.
- Audio is a protected file: it needs `pb.files.getToken()`. Cached audio is keyed per take in Cache Storage, not by URL.
- Playwright's Chromium can't play AAC, so "This take could not be played" in headless tests is expected; real phone browsers play it.
- Before pushing: `npm test && npm run lint && npm run build`.
- Claude's integration token can't re-run or dispatch Actions; a deploy happens on the next push to main (or Ross re-runs it from the Actions tab).
