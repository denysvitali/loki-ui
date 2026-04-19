# loki-ui Roadmap

Everything that isn't v0.1. See [PLAN.md](./PLAN.md) for current scope.

Ordering is *rough priority*, not a commitment. Pre-1.0 we reserve the right
to shuffle.

---

## v0.2 — correlation & ergonomics

### Split-pane Explore

Two independent `<ExplorePane>` instances side-by-side, shared time range.
Each pane can target a different datasource. Per-pane keyboard scope; label
browser targets the focused pane. URL codec is already list-shaped (PLAN
§4.9 / §5.2) so this is wiring, not refactor.

Independent per-pane time ranges deferred further — start with shared.

### Saved queries

Named, user-curated queries with rename / delete / organize. Shares storage
shape with query history (PLAN §4.13), just adds a `name` and optional
`description`. Per-datasource list + a cross-datasource "all" view.

Tags or folders possible but not a v0.2 blocker — flat list with search
first.

### Full-range export

"Export everything matching this query across the time range, not just what's
loaded." Progress modal with cancel, streaming to disk via the File System
Access API on Chromium browsers, accumulated-blob fallback on Firefox /
Safari. Pre-flight size estimate from `/index/stats`.

### Time-range calendar picker

The text-first picker in v0.1 is power-user-complete; a calendar popover for
picking absolute dates is the obvious polish for casual users. Keep the text
input — add the calendar as an option, not a replacement.

### Auto-refresh ticker

Optional periodic re-run of `query_range` (5s / 30s / 1m / 5m / off). Lives
next to the run button. Independent from live tail — the ticker runs range
queries for dashboard-ish use cases tail doesn't cover.

### Screen-reader test matrix

Commit to VoiceOver + NVDA + JAWS testing once per release. Upgrade PLAN §7
from informal VoiceOver-only. Fix findings as they come.

---

## v0.3 — signal discovery

### Detected fields side panel

`/loki/api/v1/detected_fields` + `/detected_field/{name}/values`. Sidebar
(right of the log viewer, collapsible) showing fields Loki inferred from
recent lines with cardinality and parser. Click to add `| <parser> | field="..."`
to the query. Companion to the label browser on the left.

Also extends LogQL autocomplete with Tier 4 (PLAN §4.4): after `| json` or
`| logfmt`, offer detected fields.

### Pattern drift explorer

`/loki/api/v1/patterns`. Dedicated sub-page (same route family as Explore)
showing the top N patterns matching the selector with occurrence sparklines.
Click a pattern to filter logs by it. Useful for "what shapes of log line
are spiking?" investigations.

Requires `pattern_ingester.enabled` on the cluster — capability-gated,
informational message when unavailable.

### Metrics pane

Promote PLAN §4.11's minimal metric rendering to a proper explorer:

- Axis controls (log scale, min/max).
- Legend search and multi-select hide/show.
- Series brush-to-zoom.
- Hover crosshair with values across all series.
- Stacked / side-by-side toggle for `sum by (...)` results.
- Share-link with chart-specific URL state (legend visibility, etc.).

Keep the same uPlot wrapper used for the histogram — avoid forking the
chart code.

### Sync-scroll across split panes

Two panes share a *time cursor*; scrolling log rows in one positions the
other at the same wall-clock timestamp. Incident-response killer feature.
Depends on v0.2 split pane.

---

## v0.4 — write-path & ops

### Deletion request UI

`/loki/api/v1/delete` (POST / GET / DELETE). Wrapped in a cautious UI:

- Requires an explicit "I understand this deletes logs" confirm.
- Lists existing delete requests (processed + pending) with cancel support.
- Dry-run first: uses `/index/stats` against the same query to show scope
  before submission.

Scoped per-tenant and requires the appropriate RBAC / access policy.

### Rules viewer

Read-only view of `/loki/api/v1/rules` + `/prometheus/api/v1/rules` +
`/prometheus/api/v1/alerts`. Not a rule editor — just "what rules exist,
what's firing, what are the expressions" for on-call context.

Rule *editing* (`POST /loki/api/v1/rules/{namespace}`) only after we have a
confident UX for YAML editing, diffing, and validation. Possibly never —
most orgs manage rules in source control.

---

## v0.5 — polish

### Service worker / PWA

Only if a concrete offline-adjacent use case materializes (e.g. an "offline
query result cache" for flaky-network ops work). No speculative SW work.

### i18n

At minimum: externalize strings, enable English + one additional language,
set up ICU MessageFormat or similar. Gated on whether non-English demand
shows up in issues.

### Print stylesheet

"Export this result as a PDF for the post-mortem." Niche but cheap once
we're sure of the layout.

### Mobile-first layout

Touch-friendly label browser drawer, larger row heights, simplified time
picker. Not a primary target, but the v0.1 responsive fallback ("usable
in emergencies") deserves a real pass eventually.

---

## v1.0 — stability promise

When the following are frozen:

- Datasource storage schema (localStorage keys under `loki-ui:datasources:*`).
- URL shape (`#/explore?...` query param set).
- Public export formats (NDJSON schema, CSV column convention).
- Keyboard shortcuts (users build muscle memory — breaking them is a cost).

1.0 is a commitment, not a milestone for new features. Any 1.x release
must be backward compatible on all four axes.

---

## Not planned

Things that look adjacent but we've specifically decided against:

- **Querying any backend that isn't Loki.** Tempo, Prometheus, any
  observability vendor's proprietary logs backend — not our job. The value
  is being *specifically* the best Loki UI.
- **Embedded dashboards / alert panels.** That's Grafana. We win by being
  focused.
- **Server-side component.** Breaks the "no backend" identity.
- **Telemetry / analytics / phone-home.** Stated in the README; violating
  it ends user trust.
- **Browser extension / desktop app.** Possible fork territory, not our
  distribution channel.
- **Authored documentation beyond what ships in README / in-app help.**
  Docs-site-as-product is a separate project.
