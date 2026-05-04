# Firestore Read Optimization Design

**Date:** 2026-05-05
**Topic:** Reduce Firestore read costs on list pages and interactive simulator screens

## Problem

The current client loads entire Firestore collections with `.get()` and filters them in the browser. This causes read cost to scale with total collection size instead of the small subset a screen actually needs.

## Goals

- List pages (`saved`, `wrong`, `fav`) should load only the first 10 records initially.
- Users should be able to load additional records in 10-item pages.
- `index` and `optimizer` should stop loading full collections on startup.
- Interactive pages should use narrow Firestore queries tied to the current matchup or exact document id.
- Existing local cache fallback behavior should continue to work when Firestore is unavailable.

## Design

### Firebase client

Add explicit paginated read helpers for:

- approved strategies ordered by `savedAt desc`
- wrong reports ordered by `reportedAt desc`
- favorite strategies ordered by `savedAt desc`

Each helper should return:

- `items`
- `hasMore`
- `cursor`

Add targeted read helpers for interactive pages:

- wrong reports by `matchSignature`
- approved strategy by exact document id
- favorite strategies by `enemyRosterSignature` and fallback `enemySignature`

### List pages

Replace eager full-list loading with page state:

- `items`
- `cursor`
- `hasMore`
- `isLoadingMore`

Initial render loads 10 items. A `Daha fazla yukle` button loads the next page and appends it.

### Interactive pages

Stop startup reads for:

- `app.js` wrong reports
- `optimizer.js` approved strategies
- `optimizer.js` wrong reports
- `optimizer.js` favorite strategies

Instead, fetch when the page has enough current context to build the exact lookup key.

## Error Handling

- If Firestore query fails, fall back to local cache and keep the UI usable.
- If a targeted query cannot be expressed from current state, skip the request.

## Testing

- Add tests for paginated helper behavior.
- Add tests for targeted lookup helper behavior.
- Run the existing relevant Node-based regression scripts if they are fast enough.
