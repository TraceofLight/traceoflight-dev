# Visitor Counter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global floating visitor counter card that reads `Today / Total` values from GA4 Data API on the Astro SSR server and displays `Powered by TraceofLight`.

**Architecture:** Keep GA4 collection in the existing head snippet, then add a server-only summary helper in `apps/web` that queries GA4 Data API, caches results in memory for 10 minutes, and passes the parsed values into the floating utility island. The public `/resume` and portfolio work stays untouched; this task only extends the shared layout and docs.

**Tech Stack:** Astro SSR, React island, TypeScript, node:test, Vitest, GA4 Data API

---

### Task 1: Lock the public card contract with failing tests

**Files:**
- Modify: `apps/web/tests/ga4-integration.test.mjs`
- Modify: `apps/web/tests/ui/theme-toggle.test.tsx`
- Create: `apps/web/tests/visitor-counter-layout.test.mjs`

**Step 1: Write the failing tests**

- Add a guard test that expects:
  - `src/lib/server/ga4-summary.ts` to exist
  - `BaseLayout.astro` to load visitor summary server-side
  - `FloatingUtilityButtons` to receive visitor summary props
- Add/update a UI test that expects:
  - `Powered by TraceofLight`
  - `Today 123 / Total 4567`
  - no visitor card when summary is `null`

**Step 2: Run tests to verify they fail**

Run:

```bash
node --test apps/web/tests/ga4-integration.test.mjs apps/web/tests/visitor-counter-layout.test.mjs
npm exec vitest run tests/ui/theme-toggle.test.tsx
```

Expected:

- fail because visitor summary helper does not exist
- fail because floating utility component does not render the card yet

**Step 3: Commit**

Do not commit yet.

### Task 2: Add the server-only GA4 summary helper

**Files:**
- Create: `apps/web/src/lib/server/ga4-summary.ts`
- Modify: `apps/web/package.json`

**Step 1: Write the failing test**

Extend the guard test to require:

- use of `@google-analytics/data`
- a `BetaAnalyticsDataClient`
- `totalUsers`
- `today`
- a TTL cache branch

**Step 2: Run test to verify it fails**

Run:

```bash
node --test apps/web/tests/ga4-integration.test.mjs apps/web/tests/visitor-counter-layout.test.mjs
```

Expected:

- fail because the helper file and dependency usage do not exist

**Step 3: Write minimal implementation**

- add `@google-analytics/data` dependency
- create `ga4-summary.ts`
- parse env:
  - `GA4_PROPERTY_ID`
  - `GA4_SERVICE_ACCOUNT_JSON`
  - optional `GA4_VISITOR_TOTAL_START_DATE`
  - optional `GA4_VISITOR_CACHE_TTL_SECONDS`
- create a cached `BetaAnalyticsDataClient`
- run one `batchRunReports` or two `runReport` calls
- map response to:

```ts
export type VisitorSummary = {
  todayVisitors: number;
  totalVisitors: number;
};
```

- return `null` on env/auth/query failure

**Step 4: Run test to verify it passes**

Run:

```bash
node --test apps/web/tests/ga4-integration.test.mjs apps/web/tests/visitor-counter-layout.test.mjs
```

Expected:

- helper-related assertions pass

### Task 3: Pass visitor summary through the shared layout

**Files:**
- Modify: `apps/web/src/layouts/BaseLayout.astro`

**Step 1: Write the failing test**

Update `apps/web/tests/visitor-counter-layout.test.mjs` to require:

- `await getGa4VisitorSummary()`
- prop passing into `FloatingUtilityButtons`

**Step 2: Run test to verify it fails**

Run:

```bash
node --test apps/web/tests/visitor-counter-layout.test.mjs
```

Expected:

- fail because `BaseLayout.astro` does not fetch or pass the data

**Step 3: Write minimal implementation**

- import the server helper into `BaseLayout.astro`
- fetch once per request
- pass `visitorSummary={visitorSummary}` to `FloatingUtilityButtons`

**Step 4: Run test to verify it passes**

Run:

```bash
node --test apps/web/tests/visitor-counter-layout.test.mjs
```

Expected:

- pass

### Task 4: Render the floating visitor counter card

**Files:**
- Modify: `apps/web/src/components/public/FloatingUtilityButtons.tsx`
- Modify: `apps/web/tests/ui/theme-toggle.test.tsx`

**Step 1: Write the failing test**

Add/adjust UI tests to expect:

- prop type support for visitor summary
- card render with:
  - `Powered by TraceofLight`
  - `Today ... / Total ...`
- no card when summary is absent

**Step 2: Run test to verify it fails**

Run:

```bash
npm exec vitest run tests/ui/theme-toggle.test.tsx
```

Expected:

- fail because the card is not rendered yet

**Step 3: Write minimal implementation**

- extend props:

```ts
type VisitorSummary = {
  todayVisitors: number;
  totalVisitors: number;
};
```

- render a compact surface above theme toggle / scroll-top
- keep current button behavior unchanged
- keep card hidden when summary is `null`

**Step 4: Run test to verify it passes**

Run:

```bash
npm exec vitest run tests/ui/theme-toggle.test.tsx
```

Expected:

- pass

### Task 5: Document new env and operator setup

**Files:**
- Modify: `apps/web/.env.example`
- Modify: `apps/web/README.md`
- Test: `apps/web/tests/ga4-integration.test.mjs`

**Step 1: Write the failing test**

Require env/readme mentions for:

- `GA4_PROPERTY_ID`
- `GA4_SERVICE_ACCOUNT_JSON`
- optional cache/start-date envs

**Step 2: Run test to verify it fails**

Run:

```bash
node --test apps/web/tests/ga4-integration.test.mjs
```

Expected:

- fail because the new env vars are undocumented

**Step 3: Write minimal implementation**

- add env placeholders to `.env.example`
- add runtime setup instructions to `README.md`

**Step 4: Run test to verify it passes**

Run:

```bash
node --test apps/web/tests/ga4-integration.test.mjs
```

Expected:

- pass

### Task 6: Run full verification

**Files:**
- Verify only

**Step 1: Run targeted web tests**

Run:

```bash
node --test apps/web/tests/ga4-integration.test.mjs apps/web/tests/visitor-counter-layout.test.mjs
npm exec vitest run tests/ui/theme-toggle.test.tsx
```

Expected:

- all green

**Step 2: Run full web verification**

Run:

```bash
cd apps/web
npm test
```

Expected:

- pass with only the existing Astro hints

**Step 3: Commit**

```bash
git add docs/plans/visitor-counter-design.md docs/plans/visitor-counter-implementation.md apps/web
git commit -m "feat: add ga4 visitor counter dock"
```
