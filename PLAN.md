# loki-ui — v0.1 Plan

An alternative frontend for Grafana Loki. Static SPA on GitHub Pages, no
backend of our own, points at any Loki the user configures. Goal: make log
exploration pleasant for engineers who find Grafana's Loki UI painful.

This document is the v0.1 scope. Post-v0.1 features live in [ROADMAP.md](./ROADMAP.md).

---

## 1. Identity & positioning

- **One job**: a genuinely better log explorer for Loki. Not a dashboarding
  tool, not a metrics tool, not an alerts tool.
- **No backend, ever**. No telemetry. No analytics. No phone-home. Stated
  prominently in the README — trust is part of the identity.
- **License**: Apache-2.0 (matches Loki upstream, includes a patent grant).
- **Pre-1.0 versioning**: we reserve the right to break URL/storage formats
  between minor versions; document breaks when they happen. 1.0 when those
  formats are frozen.

---

## 2. Architecture

### 2.1 Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Build | Vite (target `esnext`) |
| Framework | React 18 |
| Routing | Hash-based (`#/explore?...`) — required for GitHub Pages |
| Server cache | TanStack Query v5 |
| LogQL editor | CodeMirror 6 + `@grafana/lezer-logql` |
| Virtualized log list | TanStack Virtual |
| Charts | uPlot |
| Styling | Tailwind CSS + CSS custom properties |
| Components | shadcn/ui (Radix + Tailwind, code checked in) |
| Icons | Lucide |
| Time math | `date-fns-tz` (not Temporal — not Baseline yet) |
| Parsers | `logfmt` + native `JSON.parse` for field expansion |

### 2.2 Browser support

- Evergreen last-two-versions of Chrome, Edge, Firefox, Safari. No IE, no
  legacy mobile. ES2023 syntax, modern CSS (`:has()`, container queries),
  `AbortSignal.any()` all used freely.
- **Bundle budget**: &lt; 400 KB gzipped initial route, &lt; 1.2 MB gzipped total
  (code-split chunks included). Enforced via `size-limit` in CI.

### 2.3 Minimum Loki version

- **Loki 3.0+** is the declared floor. Runtime capability detection via
  `/loki/api/v1/status/buildinfo`; all endpoints in the v0.1 feature set are
  assumed present.

### 2.4 CORS (the load-bearing constraint)

Loki upstream does not emit CORS headers. A static SPA on a third-party origin
cannot talk to it directly. Our approach:

1. **Document the requirement** in `README.md` with the exact Caddyfile and
   NGINX snippets that make it work. These live in `examples/Caddyfile`.
2. **Dogfood it**: the dev environment uses the same Caddy sidecar, so every
   contributor exercises the real CORS path.
3. **Inline diagnostic**: when a connect attempt fails with a CORS signature
   (`TypeError: Failed to fetch` + `navigator.onLine === true` + reachable via
   opaque-image probe), the first-run card unfolds an inline "CORS is not
   configured" section containing the Caddyfile snippet and a copy button.
   Connection errors become onboarding, not failure.
4. **Mixed-content detection**: if the page is HTTPS and the datasource URL is
   HTTP, short-circuit the request and surface a dedicated error pointing the
   user at HTTPS or self-hosting.

### 2.5 Storage model

- `localStorage` keyed under the `loki-ui:` prefix.
- `schemaVersion` key; migrations run on boot. Scaffold present from v0.1
  even though the first migration is a no-op.
- Synced across tabs via `window.onstorage`; cross-tab signals (credential
  clear, datasource deleted) ride `BroadcastChannel('loki-ui')`.

---

## 3. Authentication & credentials

### 3.1 Auth schemes

- None (open Loki).
- HTTP Basic.
- Bearer token.
- `X-Scope-OrgID` (single or pipe-separated tenants), combinable with Basic
  or Bearer.

### 3.2 Credential storage (three tiers, per-datasource opt-in)

| Tier | Lifetime | When to use |
|---|---|---|
| **Ephemeral** (default) | Module-local, dies with the tab | Any shared machine; security-conscious use |
| **Session** | `sessionStorage` — survives reloads, dies on tab close | The "default that's actually usable" |
| **Persistent** | `localStorage`, behind a confirm dialog that explains the shared-origin risk on `github.io` | Users who accept the risk, or are self-hosting |

Datasource metadata (URL, tenant, auth type, name) always lives in
`localStorage` — not secret. Credentials ride the selected tier. No
"encryption" theater: a key reachable from the same JS doesn't protect against
the threat model.

### 3.3 Live tail auth (WebSocket limitations)

Browsers cannot set custom headers on a WebSocket. Our v0.1 matrix:

| Auth | Tail supported? | How |
|---|---|---|
| None | Yes | Plain WS |
| `X-Scope-OrgID` only | Yes | Passed as `?orgId=` query param |
| Basic / Bearer | **Disabled** unless the user ticks *"my proxy sets an auth cookie"* in datasource config | Cookie auth, `credentials: 'include'` |

The tail UI shows a tooltip explaining why when disabled. Our Caddy snippet
has a documented optional "cookie mode" variant for users who want tail under
auth.

### 3.4 Content Security Policy

`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src *; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;">`

`connect-src *` because the app legitimately talks to any user-configured
Loki. `style-src 'unsafe-inline'` tolerated for Tailwind's style-in-JS edge
cases; revisit in v0.2.

---

## 4. Feature scope

### 4.1 First-run experience

A single centered card: **"Connect a Loki datasource"**. Fields: name, base
URL, auth type, credentials, optional `X-Scope-OrgID`. Below the card, a
collapsible panel *"Don't have a Loki to try? Run one in 30 seconds"* with a
`docker compose up` snippet bringing up Loki + Caddy + `loki-canary`.

On submit, probe `/ready` and `/status/buildinfo`. On success, redirect to
`/explore` with the datasource selected and a starter query derived from the
first discovered label. On CORS failure, the inline diagnostic (§2.4) unfolds
in place.

Recurring visitors with an existing datasource land directly on their last
Explore view (URL-encoded state restored — see §4.9).

### 4.2 Datasource management

- Multiple datasources, switchable via a top-bar dropdown.
- Add / edit / delete via a reusable modal (same form as first-run).
- On save, health-probe and display version + status.
- Capability flags (`volumeRange`, `indexStats`, `formatQuery`, etc.) are
  detected from `buildinfo` version + response-shape fallbacks and cached per
  datasource. Features that need an unavailable capability either hide or
  gracefully degrade — never error-out silently.
- "Clear credentials" and "Clear history" actions in per-datasource settings.

### 4.3 Label browser (left sidebar)

Persistent, collapsible (280 px expanded, 40 px rail). Always in sync with
the current query.

- **Ordering**: cardinality ascending by default (low-cardinality first —
  `namespace`, `level` before `pod`), user-pinned labels sticky at top.
  Secondary alphabetical toggle.
- **Stream count chip** pinned at top: *"3,812 streams match"*, debounced
  200 ms, derived from `/series` or `/index/stats`.
- **Label expansion** fetches `/label/<n>/values?query=<currentSelector>`,
  cached per `(selector-hash, time-bucket)`. Values sorted by count desc,
  with a count chip per row.
- **High-cardinality gating**: if the values call returns &gt; `limit=1000`, show
  *"high cardinality — type to search"* instead of rendering; inline filter
  sends a regex `query=` re-query.
- **Click behavior**: click a value inserts `label="value"`; adding to an
  existing label produces a regex union (`namespace=~"prod|staging"`). Modifier
  keys: `Alt+Click` negates, `Cmd/Ctrl+Click` replaces.
- **Inline icons** per value row (on hover/focus): `+` / `−` / `×`. Mouse
  path parallel to the modifier-key path.
- **Line-filter pane** below labels: chip-style inputs for `|=`, `!=`, `|~`,
  `!~`, echoing the editor state bidirectionally.
- **Search box** at the top: `/` focuses, filters labels or (if a label is
  expanded) values.
- **Keyboard**: `/`, `↑`/`↓`, `Enter`, `Alt+Enter`, `Cmd/Ctrl+Enter`, `Space`
  (expand), `Escape`.
- Re-fetch on time-range change, debounced 400 ms; in-flight AbortController
  cancellation.

### 4.4 LogQL editor

CodeMirror 6 with `@grafana/lezer-logql` grammar.

- **Autocomplete tiers (v0.1)**:
  - **Tier 1**: structural keywords / operators / functions (static table).
  - **Tier 2**: label names inside stream selectors (`/labels?query=`).
  - **Tier 3**: label values after `=`/`=~`/`!=`/`!~` (`/label/<n>/values?query=`).
  - Tree-walk lezer for context; 150 ms debounce; 60 s TTL LRU cache keyed
    on `(datasourceId, timeRangeBucket, selectorHash, labelName?)`; per-keystroke
    AbortController.
- **Shortcuts**: `Ctrl/Cmd+Enter` run, `Ctrl/Cmd+/` format via
  `/loki/api/v1/format_query`, `Ctrl/Cmd+H` query history, `↑` in an empty
  editor opens history at the most recent entry (shell muscle memory).
- **Inline diagnostics**: LogQL 400 errors render as red decorations at the
  reported line/column in addition to the inline message.

### 4.5 Time range

- **Grammar (Grafana subset)**: `now`, `now-15m`, `now/d`, `now/d-1h`. Units:
  `s m h d w M y` (uppercase `M` for months, lowercase `m` for minutes).
  Absolute forms: ISO-8601, `YYYY-MM-DD HH:mm:ss` (in user's timezone), bare
  ns epoch (≥ 10 digits).
- **Snaps** resolved in the user's current timezone (browser default, user
  override in settings).
- **Picker** (popover):
  - Top: single text input accepting the full grammar.
  - Middle: *From* / *To* fields, same grammar, inline validation.
  - Bottom: quick ranges (5m/15m/30m/1h/3h/6h/12h/24h/2d/7d) and a Snapped
    submenu (today, yesterday, this week, last week).
- **Zoom / shift** via keyboard: `[` / `]` shift window by 50 %, `-` / `=`
  zoom 2× out/in. Shift/zoom on a relative range materializes it to absolute.
- **Histogram drag-to-zoom**: drag across the histogram produces an absolute
  range; shift-drag extends; plain click does nothing.
- **Validation**: `to < from` is rejected inline. `to - from > 30d` warns
  softly without blocking.
- **No auto-refresh ticker in v0.1** — tail covers the "live" case.

### 4.6 Histogram / volume sparkline

Above the log results.

- **Primary source**: `/loki/api/v1/index/volume_range`.
- **Per-level breakdown**: if the current selector's matching streams have a
  `level` (or `lvl`/`severity`/`log_level`) label, use
  `?targetLabels=level` for an index-backed breakdown.
- **Fallback**: no `level` label present → show aggregate bars from
  `volume_range`, *overlay* a secondary-opacity client-side level tally from
  the fetched log lines, labelled *"estimated from visible logs"*.
- **No `| json` push-down** for histograms in v0.1 — avoids expensive
  query-time parsing.
- **Step selection**: friendly snap-up from a fixed ladder
  (`1s 2s 5s 10s 15s 30s 1m 2m 5m 10m 15m 30m 1h 2h 3h 6h 12h 1d`), target
  ~150 buckets, clamped to `[1s, 1d]`, ResizeObserver for chart width.
  Re-fetch only if friendly step actually changes. Current step visible as
  *"buckets: 1m"* above the chart.
- **Palette**: Okabe-Ito (CVD-safe) — muted teal INFO, amber WARN, vermilion
  ERROR, grey DEBUG/TRACE.

### 4.7 Log viewer

Virtualized via TanStack Virtual with variable row heights (ResizeObserver
measurement).

- **Row**: timestamp · level badge · line (collapsed preview).
- **Level detection**: check `level`/`lvl`/`severity`/`log_level` labels first;
  fall back to regex on the line. Always client-side, never blocks.
- **Badges**: hue + short text token (`ERR`/`WRN`/`INF`/`DBG`) + left-border
  color stripe. Color-blind users always have the text token.
- **ANSI colors**: rendered by default via a small 4-bit + 8-bit xterm
  mapper (`src/lib/parse/ansi.ts`, ~30 LOC). Toggle in the viewer header.
- **Line wrap**: **off by default** (horizontal scroll). Toggle; URL-encoded
  as `wrap=1` so shared views preserve it.
- **Multiline entries**: collapsed to first line with a *"+N lines"* chip;
  `Space` / click expands in place (session-only state).
- **Structured metadata**: pill labels right of the line; in expanded view,
  collected into a metadata section in the key-value tree.
- **Field expansion**: on row expand, pretty-print JSON / logfmt fields as
  a key-value tree with per-field *"filter by"* (`| key="value"`) and
  *"copy value"* actions.
- **Timestamps**: local time default, user preference for local / UTC /
  relative in localStorage. Hover any timestamp for a tooltip with the other
  two forms.
- **Truncation**: lines longer than 64 KB are truncated with *"view full"*
  expand; copy actions always yield the full line.
- **Copy**:
  - Default text selection is as rendered.
  - Row-level copy icon (hover + keyboard-reachable): structured form
    `<iso timestamp>\t<stream labels>\t<line>`.
  - Right-click menu: *Copy line only*, *Copy with labels*, *Copy as JSON*.
- **Context panel**: see §4.10.
- **Keyboard**: `j`/`k` / `↑`/`↓` navigate, `Space` / `o` expand, `y` copy
  structured, `c` open context panel.
- **Semantics**: `role="grid"`, rows `role="row"`, cells `role="gridcell"`.

### 4.8 Query execution

- Always `/loki/api/v1/query_range`, `direction=backward` for streams.
- Default `limit=1000`, configurable per datasource.
- **Preflight** via `/index/stats` *in parallel* with the real query; if
  `bytes > 5 GB` or `entries > 50M` (configurable per datasource), show a
  non-blocking "*scanning ~12 GB — [cancel]*" banner. **No confirmation
  modal** that gates Enter.
- **Concurrency cap**: one in-flight `query_range` per datasource; rerun
  cancels prior. Wired through TanStack Query with `AbortSignal`.
- **Pagination** ("Load older"): explicit button, no infinite scroll. Shift
  `end` to the oldest returned ns timestamp; dedupe client-side on
  `(ns_ts, line_hash)`. Truncation chip ("*showing 1000 of ~N*") uses
  `/index/stats` for N when available, else "*≥ 1000*".
- **Retry on 429** with `Retry-After` — automatic once, second hit surfaces
  a toast with manual retry.
- **Metric / matrix responses** (§4.11) replace the log list with a minimal
  line chart.

### 4.9 URL state & shareable links

Everything meaningful is URL-encoded in the hash:

`#/explore?ds=<id>&q=<logql>&from=<expr>&to=<expr>&limit=<n>&live=1&wrap=1&ctx=<rowId>`

- Relative time expressions remain relative (`from=now-15m`) — URL stays live.
- Absolute picks are materialized in the URL.
- Never silently convert one form to the other.
- **Copy link dropdown**: *Copy relative link* (live) / *Copy snapshot link*
  (materialized absolute timestamps at copy-time).
- Expanded-row state, scroll position, and credential presence are **not**
  URL-encoded.
- List-shaped internally (`?ds=a&q=X` vs `?ds=a,b&q=X,Y`) — single pane
  today, split pane later without URL-codec breakage.

### 4.10 Context panel

Triggered by *c* on a focused row (or button).

- **Right-side overlay panel** (~60 % viewport width). Does not destroy the
  current Explore state. `Escape` closes. URL state `ctx=<rowId>`.
- **Selector**: exact stream labels of the anchor row *minus* `level`/`lvl`/
  `severity`/`log_level` — i.e. *"everything in this pod/container/app around
  this moment"*.
- **Line filters dropped**. A chip above results says *"filters dropped: |= \"timeout\" [restore]"*.
- **Window**: ±10 min default, inline `± 5m | 10m | 30m | 1h` control.
- **Anchor row**: highlighted with a left-border accent and a brief pulse
  (respects `prefers-reduced-motion`).
- **Implementation**: reuses `<ExplorePane>` (§5.3) in narrower mode, no
  duplicated logic.
- **Keyboard**: `[` / `]` jump to prev/next occurrence of the same line text
  in the context window.

### 4.11 Metric / matrix rendering (minimal)

When `resultType` is `matrix` or `vector`:

- Log list hidden. Minimal uPlot line chart in its place. One line per
  series, CVD-safe palette, click-to-hide in the legend.
- Histogram sparkline suppressed (the chart itself is the view).
- Stats footer identical to streams case.
- **Live tail disabled** for metric queries (tooltip explains).
- **No "metrics mode" toggle** — UI reacts to the response shape.
- Shares the `<MetricChart>` component with the histogram.

Not a full metrics explorer. See [ROADMAP.md](./ROADMAP.md) §Metrics pane.

### 4.12 Live tail

WebSocket to `/loki/api/v1/tail`.

- Auto-reconnect with exponential backoff (100 ms → 30 s cap); stop on auth
  error.
- New lines prepend to the virtualized list; scroll-locks unless the user
  has scrolled up (standard "stay at bottom" behavior inverted for
  direction=backward).
- `dropped_entries` events render as a subtle warning pill with count and
  hover for details.
- 64 KB line-length cap inherited from §4.7.
- See §3.3 for auth matrix.

### 4.13 Query history

- Ring buffer of up to 200 entries per datasource in localStorage. Entry:
  `{ q, from, to, at, execMs, bytes, datasourceId }`.
- Popover opened by `Ctrl/Cmd+H` or `↑` in an empty editor. Shows truncated
  query, *"3m ago"*, exec time + bytes.
- `Enter` re-runs (restores `q`, `from`, `to`). `Shift+Enter` copies into
  editor without running.
- Per-datasource "Clear history" button in datasource settings.
- Syncs across tabs via storage events.
- Saved (named) queries deferred to v0.2.

### 4.14 Export results

- **Scope**: exports what is *currently loaded*. Full-range scans deferred.
- **Formats**:
  - Streams → **NDJSON** (schema below) or **plain text**.
  - Matrix → **NDJSON** or **CSV**.
- **Header comments** prepended:
  ```
  # loki-ui export
  # datasource: prod-loki
  # query: {app="foo"} |= "error"
  # range: 2026-04-19T00:00:00Z / 2026-04-19T01:00:00Z
  # entries: 842
  ```
- **NDJSON schema** (one object per line):
  ```json
  {"ts":"1713484800123456789","iso":"...","labels":{...},"line":"...","metadata":{...}}
  ```
  `ts` is nanosecond epoch as a **string** (`2^53` doesn't fit). `iso` is a
  convenience. `metadata` present only when non-empty.
- **Plain text**: `<iso>  label=v label=v  <line>` — `\n` inside a line is
  replaced with `\t\t` for one-entry-per-output-line.
- **Filename**: `loki-ui-<datasource>-<unix-epoch>.{ndjson,txt,csv}`.
- **Mechanism**: `Blob` + `URL.createObjectURL()` + `<a download>`. Portable.

### 4.15 Error surface

Typed discriminated union in `src/lib/loki/errors.ts`:

```ts
type LokiError =
  | { kind: 'cors';           url: string }
  | { kind: 'mixed-content';  url: string }
  | { kind: 'network';        online: boolean }
  | { kind: 'auth';           status: 401 | 403; body?: string }
  | { kind: 'tenant-missing' }
  | { kind: 'logql';          message: string; line?: number; col?: number }
  | { kind: 'timeout';        message: string }
  | { kind: 'limit';          limit: string; message: string }
  | { kind: 'rate-limit';     retryAfter: number }
  | { kind: 'feature-absent'; feature: CapabilityKey }   // never rendered
  | { kind: 'cancelled' }                                // never rendered
  | { kind: 'parse';          detail: string }
  | { kind: 'server';         status: number; body?: string };
```

Presentation mapped centrally:

| Kind | Presentation |
|---|---|
| `cors`, `mixed-content`, `network` | Full-pane empty state + inline diagnostic |
| `auth`, `tenant-missing` | Top-of-app banner (doesn't displace content) |
| `logql` | Inline CodeMirror decoration + text message |
| `timeout`, `limit`, `server` | In-pane error |
| `rate-limit` | Silent retry once, then toast |
| `feature-absent`, `cancelled` | Silent |
| `parse` | In-pane with "this might be a bug" copy-error button |

Every error surface has a **Copy error details** button that packages
`{ kind, endpoint, status, body[:500], timestamp, loki-ui version, buildinfo }`
for pasting into a GitHub issue. No telemetry.

---

## 5. Project layout

```
loki-ui/
├── PLAN.md                         (this file)
├── ROADMAP.md
├── README.md                       # setup, CORS guide, screenshot
├── CONTRIBUTING.md                 # dev env, tests, commit style
├── SECURITY.md                     # coordinated disclosure
├── LICENSE                         # Apache-2.0
├── CODEOWNERS
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                  # typecheck + lint + test + build + size-limit
│   │   ├── pages.yml               # deploy dist/ to GitHub Pages on push to main
│   │   └── release-please.yml      # changelog + tag automation
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.yml
│   │   └── feature.yml
│   └── pull_request_template.md
├── examples/
│   ├── Caddyfile                   # CORS + preflight, single source of truth
│   ├── docker-compose.yml          # prod-shape: Loki + Caddy (for users)
│   └── docker-compose.dev.yml      # dev-shape: Loki + Caddy + canary
├── index.html
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── public/
│   ├── favicon.svg
│   └── fonts/                      # self-hosted JetBrains Mono (mono fallback only)
└── src/
    ├── main.tsx
    ├── app/                        # routes, layout, theme provider, shortcut help modal
    ├── components/
    │   └── ui/                     # shadcn/ui components (checked in)
    ├── features/
    │   ├── datasource/             # CRUD, auth, health probe, capability detection
    │   ├── explore/                # ExplorePane, editor, results, histogram
    │   ├── labels/                 # LabelBrowser (sidebar)
    │   ├── tail/                   # WebSocket live tail
    │   ├── history/                # query history popover + storage
    │   ├── export/                 # NDJSON / plain / CSV formatters
    │   └── context/                # context panel
    ├── lib/
    │   ├── loki/                   # typed client, errors, capabilities
    │   ├── logql/                  # CodeMirror setup, formatter call, autocomplete
    │   ├── parse/                  # ansi, logfmt, level detection
    │   ├── time/                   # range grammar, picker helpers, step selection
    │   ├── state/                  # cross-tab sync, storage migrations, url codec
    │   └── update/                 # HEAD-poll update detection
    └── styles/
```

### 5.1 Loki client (`src/lib/loki/`)

One typed fetch wrapper all features share. Handles:

- Auth header injection (Basic / Bearer / tenant).
- `AbortSignal` piped from TanStack Query for cancellation.
- 429 + `Retry-After` transparent single retry.
- Typed `LokiError` union from every method.
- Capability detection from `buildinfo` + response-shape fallbacks.
- CORS inference via opaque-image probe when `fetch` throws `TypeError`.
- Mixed-content detection before hitting the wire.

Methods: `ready`, `buildInfo`, `query`, `queryRange`, `labels`, `labelValues`,
`series`, `stats`, `volumeRange`, `formatQuery`, `tail` (returns a cancellable
WebSocket wrapper).

### 5.2 URL codec (`src/lib/state/url.ts`)

Round-trips `{ datasources, queries, from, to, limit, live, wrap, ctx }`
through a standard `URLSearchParams` on the hash. List-shaped internally from
day one even though v0.1 only has one pane.

### 5.3 `<ExplorePane>` component

Takes `{ datasourceId, initialQuery, timeRange, paneId }`. No references to
module-level state. Single instance in v0.1; two-instance split pane deferred
to v0.2 at zero refactor cost.

---

## 6. Theming & visual identity

- **Dark + light** themes; dark default; first visit respects
  `prefers-color-scheme`. Per-device toggle in the top bar, persisted in
  localStorage. Not URL-encoded.
- **Single source of truth** via CSS custom properties on
  `:root[data-theme="dark"]` / `:root[data-theme="light"]`. Tailwind's
  `dark:` variant disabled; shadcn components, custom code, and uPlot all
  read from the same variables.
- **Palette**: near-monochrome UI chrome + one accent (muted teal/cyan — not
  Grafana orange). Okabe-Ito CVD-safe for level/stack colors.
- **Typography**:
  - UI: system sans stack, zero font-fetch on load (self-hosted Inter as
    optional fallback).
  - Mono: system mono + self-hosted JetBrains Mono fallback (weights 400 /
    500 only, `font-display: swap`).
- **Density**: compact default (24 px log rows), comfortable toggle (32 px)
  in localStorage.
- **Level badges**: color + short token (`ERR`/`WRN`/`INF`/`DBG`) + left
  border — never color-alone.
- **Motion**: respects `prefers-reduced-motion` (histogram transitions,
  context panel slide, anchor pulse).
- **Favicon**: small monochrome SVG glyph (~1 KB). No custom logo/illustration
  in v0.1.

---

## 7. Accessibility

- **Target**: WCAG 2.2 Level AA (authoring-side).
- **Keyboard-complete**: every interaction reachable without a mouse. Golden
  path — first-run → connect → query → run → browse labels → expand row →
  filter by field → copy → open context → tail on/off — manually tested
  keyboard-only per release.
- **`?`** opens a shortcut help modal. Shortcuts documented in-app and in
  README.
- **Log list** is `role="grid"` with uniform `j/k/↑/↓`, `Space`, `y`, `c`,
  `Home`/`End`.
- **Live regions** (polite): query status, error banners, tail arrival count
  (throttled to 1 Hz). The log list itself is **not** a live region.
- **Histogram**: hidden `sr-only` tabular summary that updates with the
  chart.
- **`eslint-plugin-jsx-a11y`** default recommended rules, `@axe-core` on the
  three integration tests (§8).
- **Focus-visible** ring on every focusable element, distinct from hover.
- **Honesty clause** in the README: v0.1 tested informally on
  VoiceOver+Safari only; systematic NVDA/JAWS matrix is v0.2.

---

## 8. Testing & CI

### 8.1 Tests shipped in v0.1

- **Unit (Vitest)** for the pure-logic targets:
  - Loki client (auth, error classification, retry, capability detection).
  - Log-line parsing and level detection (JSON, logfmt, ANSI, level regex).
  - Time-range grammar (`now-15m`, snaps, timezone-aware resolution).
  - URL codec round-tripping.
  - LogQL autocomplete context detection (lezer tree walk).
  - Histogram step selection.
- **Integration (Vitest + MSW)** — three tests pinning wiring:
  - Explore: enter query → see lines → expand row → filter by field.
  - Label browser: labels → values → click-insert round-trip.
  - Tail: WS open → message → render → close.
- **No component-level RTL** tests in v0.1 (rots fastest under UI iteration).
- **No Playwright** in v0.1 — manual E2E checklist in §9 instead.

### 8.2 CI (`.github/workflows/ci.yml`)

On PR and push to main, Node 22 LTS + pnpm via `actions/setup-node@v4`:

```
pnpm install --frozen-lockfile
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint + jsx-a11y
pnpm test           # vitest + axe
pnpm build          # vite build
pnpm size-limit     # bundle budget enforced
```

Always target the latest versions of GitHub Actions per
`https://raw.githubusercontent.com/simonw/actions-latest/refs/heads/main/versions.txt`.

### 8.3 Pages deploy (`.github/workflows/pages.yml`)

Triggered on push to `main` *after* CI passes. Uses `actions/deploy-pages`.
Separate workflow so a deploy failure doesn't block PR merges.

`VITE_BASE_PATH` env drives the base path so forks can self-host to their own
Pages URL without code changes.

### 8.4 Release automation

`release-please` manages:

- Conventional-commits → auto-generated `CHANGELOG.md`.
- Semver bumps via release-please PR.
- GitHub Releases + `v0.x.y` tags on merge of the release PR.

Dependabot on weekly schedule for `npm` and `github-actions`.

---

## 9. Verification checklist

Per-release manual pass with `docker compose -f examples/docker-compose.dev.yml up`:

1. First-run card accepts URL + auth → probe succeeds → lands on Explore
   with a sensible starter query.
2. Intentional CORS break (stop Caddy, point at raw Loki) → inline
   diagnostic renders with correct snippet.
3. Label browser populates; cardinality-ordered; clicking a value updates
   editor and refocuses next action.
4. Stream count chip updates as selector changes.
5. Range query returns logs; expanding a JSON line reveals fields;
   *filter by* round-trips into the selector.
6. Histogram strip aligns with log density; step label updates on range
   change; per-level stacking visible when `level` label exists.
7. Live tail opens, streams, reconnects after a forced Caddy restart, and
   shows `dropped_entries` when rate-limited.
8. Keyboard-only walkthrough of the golden path from §7 — no mouse required.
9. Share link: copy *snapshot* → open in incognito → identical view
   (minus credentials).
10. Theme toggle, density toggle, timezone toggle round-trip across reloads.
11. Multi-tab: open two tabs, edit a datasource in one, dropdown in the
    other updates without reload.
12. Deploy preview: push a branch → Pages deploy lands on
    `https://<user>.github.io/loki-ui/`.

---

## 10. Non-goals for v0.1

- Split pane / multi-datasource comparison.
- Saved (named) queries and query organization.
- Metric explorer (axis controls, series search, brush-to-zoom).
- Pattern explorer / detected-fields side panel.
- Deletion request UI.
- Rules / alerts viewer.
- Service worker / offline / PWA install.
- i18n.
- Screen-reader matrix beyond VoiceOver.
- Print stylesheet.
- Mobile-first layout (responsive, but desktop-first).

See [ROADMAP.md](./ROADMAP.md) for where these land.
