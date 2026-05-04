# Firestore Read Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-collection Firestore reads with paginated list queries and targeted interactive lookups.

**Architecture:** Extend `firebase-client.js` with focused query helpers, then update list pages to use 10-item pagination and interactive pages to perform narrow lookups only when needed. Keep existing cache fallback behavior intact.

**Tech Stack:** Browser JavaScript, Firebase compat Firestore, Node test scripts

---

### Task 1: Add read-helper tests

**Files:**
- Create: `_web-disi/tests/test-firestore-read-optimization.js`
- Modify: `firebase-client.js`

- [ ] Write failing tests for paginated and targeted helper functions.
- [ ] Run the test script and confirm the expected failures.
- [ ] Implement the minimal helper exports needed by the tests.
- [ ] Re-run the test script and confirm it passes.

### Task 2: Add paginated Firestore list APIs

**Files:**
- Modify: `firebase-client.js`

- [ ] Add 10-item paginated query helpers for approved, wrong, and favorite collections.
- [ ] Preserve cache fallback behavior for no-db and error cases.
- [ ] Expose `items`, `cursor`, and `hasMore` to consumers.

### Task 3: Update list-page UIs

**Files:**
- Modify: `saved.js`
- Modify: `wrong.js`
- Modify: `fav.js`
- Modify: `saved.html`
- Modify: `wrong.html`
- Modify: `fav.html`

- [ ] Replace eager full-list loading with paged loading state.
- [ ] Add `Daha fazla yukle` controls.
- [ ] Keep existing sorting/filter behavior coherent with paged data.

### Task 4: Update interactive pages to use targeted lookups

**Files:**
- Modify: `app.js`
- Modify: `optimizer.js`
- Modify: `firebase-client.js`

- [ ] Remove startup full-collection reads.
- [ ] Query wrong reports by `matchSignature` only when needed.
- [ ] Query approved strategies by exact doc id when available.
- [ ] Query favorite strategies by enemy signature only when needed.

### Task 5: Verify, backup implementation commit, and deploy

**Files:**
- Modify: `_web-disi/docs/SESSION_CHANGES_2026-05-05_firestorereads.md`

- [ ] Run the new targeted test script.
- [ ] Run any fast regression/build checks that apply.
- [ ] Record the session changes.
- [ ] Commit the implementation.
- [ ] Deploy the updated Firebase site.
