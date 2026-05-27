# Plan: Switch lyric sourcing to Genius + show annotations + link Friends to Wikipedia

Last updated: 2026-05-26

## Goals

- **Switch to Genius for lyric sourcing** (replacing current `lrclib` usage in `lib/lyrics.ts`).
- **Show Genius annotations** for each lyric line (“bar”) that contains a Friend mention in the UI.
- **Link to Wikipedia** for each Friend where we can confidently resolve a page.

## Non-goals (for v1)

- Perfect 1:1 alignment between Genius “referent fragments” and your normalized lyric “lines” for every song.
- Supporting featured-artist attribution beyond what Genius provides (we’ll preserve your existing `FRIENDS.md` constraint and avoid changing extraction logic in v1).
- Building a full Wikipedia knowledge graph (we’ll do best-effort single-page resolution with caching and a manual override escape hatch).

## Current architecture seams (what we will reuse)

- **Lyrics store on disk**: `data/lyrics.json` managed by `lib/lyrics.ts` (read/write, selection, per-track line count).
- **Lyrics sync endpoint**: `app/api/lyrics/route.ts` streams NDJSON events and calls `fetchLyricsFromApi(song, album)`.
- **Mentions store on disk**: `results.json` (read via `lib/results.ts`); per-track mentions via `app/api/mentions/track/route.ts`.
- **Detail UI**: `app/page.tsx` renders each mention via `MentionReviewRow`.
- **Bar matching behavior**: `/dev/annotate` uses a permissive match (`m.bar === line` OR `line.includes(m.bar)`), which is a good model for annotation matching too.

## Library choice: `lyricsgenius` for Genius integration

Use the `lyricsgenius` Python client as the primary integration layer for Genius API + lyric retrieval behavior.

Why this is a fit:

- It wraps Genius search/song APIs with less custom glue code.
- It is explicitly designed around the Genius limitation that full lyrics are not directly returned by API responses.
- It centralizes behavior we would otherwise hand-roll (search, song resolution, lyrics extraction workflow).

Planned integration pattern:

- Add a small Python helper script (invoked from Node API routes) that:
  - accepts `song`, `album`, and artist (`Drake`) inputs
  - uses `lyricsgenius` to resolve the best Genius song match
  - returns normalized lyrics + Genius metadata (`song_id`, `url`, title, artist)
- Keep all existing TypeScript endpoints (`/api/lyrics`, `/api/genius/annotations`) as the orchestration layer; they call the helper and persist data in existing JSON stores.

Dependency/runtime notes:

- Since this repo uses `uv` when available, manage the Python dependency with `uv` and lock it in `uv.lock`.
- Keep the helper script deterministic (JSON in/out, explicit exit codes) so streaming NDJSON progress in existing routes stays stable.

Reference docs: [LyricsGenius documentation](https://lyricsgenius.readthedocs.io/en/master/).

## Key constraint: Genius lyrics licensing / API behavior

Genius’s official API is great for **song metadata + annotations**, but **full lyrics** are not reliably returned via API. `lyricsgenius` addresses this by combining Genius API usage with lyric extraction logic.

**Plan approach**:

- Use `lyricsgenius` for **song discovery + lyric retrieval**.
- Use Genius API (directly or via helper) for **annotations/referents**.
- Store only what we need for the app (plain text lyrics + the minimal annotation payload per matched bar).

If Genius page structure or extraction quality regresses, we can later add a fallback provider (or keep `lrclib` as fallback), but v1 will treat Genius (via `lyricsgenius`) as the primary source.

## Data model changes

### 1) Extend the lyrics store track payload

Update `lib/lyrics.ts` types:

- `StoredTrack` additions:
  - `source`: `'genius'` (string literal; keep open for future multi-source)
  - `geniusSongId?`: number
  - `geniusUrl?`: string
  - `annotations?`: Record<string, GeniusLineAnnotation[]> keyed by normalized lyric line (or a stable hash)

Define minimal annotation types (new file suggested: `lib/genius-types.ts`):

- `GeniusLineAnnotation`:
  - `referentId`: number
  - `fragment`: string (the Genius-highlighted fragment)
  - `annotationId`: number (primary annotation chosen)
  - `url`: string
  - `text`: string (plain text; strip formatting)
  - `verified?`: boolean (if Genius marks it as verified)

### 2) Friend → Wikipedia link cache

Add `data/friends-wikipedia.json`:

- Shape:
  - `updatedAt`: ISO string
  - `byFriend`: Record<string, { url: string; title: string; source: 'wikipedia'; confidence: 'high'|'medium'|'low' } | null>
  - `overrides`: Record<string, string> (manual URL override keyed by Friend canonical name)

Rationale:

- Avoid hammering Wikipedia on each render.
- Make it easy to correct edge cases (stage names, ambiguous names, nicknames).

## New modules / endpoints

### 1) Genius client module

Create `lib/genius.ts`:

- **Auth**: uses `GENIUS_ACCESS_TOKEN` (preferred; client ID/secret only needed for OAuth flows you’re not using here).
- Functions:
  - `searchSong({ song, album, artist='Drake' }) -> { id, url, title, primaryArtist } | null`
  - `fetchLyricsViaPythonHelper({ song, album, artist }) -> { lyrics, geniusSongId, geniusUrl } | null`
  - `fetchReferents(songId) -> Referent[]` (Genius “referents” for annotations)
  - `pickLineAnnotations(lines: string[], referents: Referent[]) -> Record<line, GeniusLineAnnotation[]>`

Implementation notes:

- Prefer `lyricsgenius` in Python helper for lyrics retrieval rather than maintaining custom HTML parsing in TypeScript.
- Normalize lyrics consistently with your existing patterns:
  - Trim each line
  - Remove empty lines
  - Preserve section headers only if they appear as lines in Genius (optional; for v1 we can drop bracketed headers like `[Chorus]` if they hurt matching)

### 2) Update `fetchLyricsFromApi` to Genius-first

Replace the contents of `fetchLyricsFromApi` in `lib/lyrics.ts` with:

- Genius search via helper → pick best match
- `lyricsgenius` retrieval → normalize lyrics
- Return `string | null` lyrics as today

Also update `applyLyricsToStore(...)` call site to store:

- `source = 'genius'`
- `geniusSongId`, `geniusUrl`

### 3) Annotation sync job (new endpoint)

Add `POST /api/genius/annotations` (new route: `app/api/genius/annotations/route.ts`):

- Input: optional track selection (same schema as `/api/lyrics` uses).
- Behavior:
  - Load `data/lyrics.json`
  - For each track with `geniusSongId` and lyrics present:
    - Fetch referents
    - Compute per-line annotations
    - Persist into the track’s `annotations`
  - Stream progress as NDJSON (same UX pattern as `/api/lyrics` and `/api/scan`)

Why separate from `/api/lyrics`:

- Keeps lyrics sync fast and resilient.
- Annotations can be fetched later, retried, and cached independently.

### 4) Friend → Wikipedia resolver (new endpoint)

Add `POST /api/friends/wikipedia` (new route: `app/api/friends/wikipedia/route.ts`):

- Input: `{ friends?: string[] }` or default “all friends present in `results.json`”.
- Behavior:
  - Load cache file `data/friends-wikipedia.json` (create if missing).
  - For each friend not in cache (and not overridden):
    - Query Wikipedia search APIs (best-effort):
      - `opensearch` or REST search endpoint
      - then `page/summary` for the top hit
    - Heuristics for confidence:
      - Exact (case-insensitive) title match = high
      - Redirect match = medium
      - Otherwise low; store but don’t auto-link unless user opts in (see UI behavior)
  - Write cache

This is intentionally a one-shot “sync” to avoid doing live Wikipedia lookups from the client.

## Mapping Genius annotations to Friend-containing lines

Goal: for each Mention’s `bar` (a lyric line), show relevant Genius annotation(s).

### Matching strategy (v1)

1. **Start from the lyric line in your store** (the canonical “line”).
2. Normalize both `line` and Genius `referent.fragment`:
   - lowercase
   - collapse whitespace
   - strip punctuation at edges
3. A referent matches a line if either:
   - `line.includes(fragment)` OR `fragment.includes(line)` for short fragments, OR
   - token overlap ratio exceeds threshold (fallback)
4. For each matching referent, pick the “best” annotation:
   - prefer `verified` annotations
   - otherwise prefer the longest body text
5. Store up to N annotations per line (suggest N=2) to avoid UI overload.

### Friend filter

We only surface annotations in the main UI when:

- The line is a `Mention.bar` for the selected Friend, OR
- The line contains the Friend name (optional enhancement later)

This keeps UI relevant and avoids needing perfect full-song annotation coverage.

## UI changes

### 1) Friend header: Wikipedia link (when possible)

In `app/page.tsx` detail tab (the `selectedFriend` header):

- If `friends-wikipedia` cache has a **high or medium confidence** URL (or an override), render:
  - `selectedFriend` as a link or add a small “Wikipedia” link next to it

### 2) Mention rows: annotation callout

Extend `MentionReviewRow` in `app/page.tsx`:

- Add a small “annotation” affordance on each mention row when annotations exist for that `bar`:
  - e.g. a button: “annotation” / “2 annotations”
- On click, expand a panel under the bar:
  - show annotation text (plain)
  - show a link: “View on Genius” (using the annotation URL)

Data sourcing options:

- **Option A (fastest)**: in `GET /api/lyrics/track`, include annotations for the track (or just the annotations for the mention bars).
- **Option B (more scalable)**: new endpoint `GET /api/annotations/track?song=&album=` returns only annotations keyed by line.

Given current app shape, Option A is simplest: `/dev/annotate` already fetches lyrics track data; main page can do the same when a friend is selected.

## Dev workflow / demo workflow

### Local dev

- Run lyrics sync: existing “Sync lyrics” button → now uses Genius under the hood.
- Run annotation sync: add a new button “Sync annotations” (parallel to lyrics/extract).
- Run Wikipedia sync: add a new button “Sync Wikipedia links”.

### Demo (Vercel)

Keep the existing demo strategy:

- Commit `data/lyrics.json` (now Genius-sourced).
- Commit any derived annotation payloads inside `data/lyrics.json` (or a separate committed file if it grows too large).
- Commit `data/friends-wikipedia.json` (stable, no runtime dependency).

If the annotation payload balloons `data/lyrics.json`, split into a separate committed file:

- `data/annotations.json` keyed by track key → line → annotations.

## Files to touch (expected)

- **Modify**
  - `lib/lyrics.ts` (switch provider; store Genius metadata; optionally store annotations)
  - `app/api/lyrics/route.ts` (update event fields if needed: `source`, `geniusUrl`)
  - `app/api/lyrics/track/route.ts` (optionally include annotations)
  - `app/page.tsx` (annotation UI + Wikipedia link in Friend header)

- **Add**
  - `lib/genius.ts`
  - `lib/genius-types.ts` (or colocate types in `lib/genius.ts`)
  - `app/api/genius/annotations/route.ts`
  - `app/api/friends/wikipedia/route.ts`
  - `data/friends-wikipedia.json` (generated locally, committed for demo)

## Error handling / rate limiting / reliability

- **Genius API limits**: implement basic retries and concurrency caps (mirror `LYRICS_CONCURRENCY` pattern; start with 5 for annotations).
- **Scraping failures**:
  - Store `lyrics: null` on failure (as today).
  - Emit `lyrics_fail` with extra fields `reason` and `geniusUrl` when available.
- **Annotation failures**:
  - Do not fail the whole job for one track; store empty list for that line.
- **Wikipedia ambiguity**:
  - Store `null` when we can’t confidently resolve.
  - Provide manual overrides in `data/friends-wikipedia.json.overrides`.

## Implementation order (recommended)

1. **Genius lyrics sourcing**
   - Implement Python helper using `lyricsgenius`.
   - Implement `lib/genius.ts` bridge to call helper + parse JSON output.
   - Swap `fetchLyricsFromApi` to Genius-first and store Genius metadata.
   - Run local sync; confirm `data/lyrics.json` regenerates cleanly.

2. **Annotation pipeline**
   - Implement `POST /api/genius/annotations` + persistence.
   - Add UI affordance for annotations in `MentionReviewRow`.

3. **Wikipedia resolver**
   - Implement `POST /api/friends/wikipedia` and cache file.
   - Render Friend header link with confidence gating + overrides.

4. **Demo artifacts**
   - Update replay generator if needed (only if you add new NDJSON event fields).
   - Commit updated `data/lyrics.json` (and `data/friends-wikipedia.json`).

## Test plan (local)

- Lyrics sync:
  - Run full sync; ensure `parsed` count is in expected range and failures are reasonable.
  - Spot check a few tracks’ lyric formatting (line breaks, bracket headers).

- Annotation display:
  - Pick a Friend with known mentions (e.g. “Lil Wayne”, “Noah '40' Shebib”).
  - Verify at least one mention line shows an annotation panel and links to Genius.

- Wikipedia links:
  - Verify a few Friends resolve and link correctly.
  - Verify ambiguous friends stay unlinked unless overridden.

