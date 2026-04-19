# loki-ui

A better frontend for [Grafana Loki](https://grafana.com/oss/loki/). Static
SPA hosted on GitHub Pages. No backend. Points at any Loki instance you
configure.

> **Status**: pre-release (0.x). Follow progress on
> [GitHub](https://github.com/denysvitali/loki-ui).

## What's there

- **Log explorer** — LogQL query, time range picker, virtualized log
  viewer, per-row field expansion with click-to-filter.
- **Label browser** — sidebar that narrows labels + values as you
  compose a selector, with cardinality-aware ordering and pinned
  favourites.
- **Histogram** — volume-by-level strip above the log list, fed from
  `/index/volume_range`, with drag-to-zoom.
- **Live tail** — WebSocket streaming for no-auth / tenant-only / cookie
  auth configurations.
- **Context panel** — "show me what else was happening around this line"
  as a side overlay.
- **Query history** — per-datasource ring buffer; `Ctrl/Cmd+H` or `↑` in
  an empty editor.
- **Export** — NDJSON and plain text for log queries, NDJSON and CSV for
  metric queries.
- **Multiple datasources** — URL state in the hash, shareable, with
  indexed params ready for v0.2 split-pane.
- **Dark + light themes** — per-device toggle, system-preference default.
- **No backend / no telemetry / no phone-home.** Everything runs in the
  browser.

See [PLAN.md](./PLAN.md) for the v0.1 design and
[ROADMAP.md](./ROADMAP.md) for what comes after.

## CORS is required

Loki doesn't emit `Access-Control-Allow-Origin` headers out of the box, and
a static SPA on `github.io` talks directly to your Loki from the user's
browser. You'll need a reverse proxy in front of Loki that adds CORS
headers and handles `OPTIONS` preflights.

`examples/Caddyfile` is a minimal, battle-tested configuration; drop it in
front of your Loki and you're done:

```
caddy run --config examples/Caddyfile
# Loki on :3101 with CORS; point loki-ui at http://your-host:3101
```

See also `examples/docker-compose.yml` for a production-shaped recipe and
`examples/docker-compose.dev.yml` for a dev stack with `loki-canary`
generating synthetic logs.

## Using the hosted version

The project is deployed to GitHub Pages at:

> `https://denysvitali.github.io/loki-ui/`

On first visit you'll see a **Connect a Loki datasource** card. Fill in:

- a name,
- base URL of your CORS-enabled Loki proxy,
- auth type (none / Basic / Bearer / X-Scope-OrgID),
- optional "remember credentials" preference (ephemeral / session /
  persistent — the persistent tier warns you about the shared-origin
  risk on `github.io`).

Click **Connect** — the UI probes `/ready` and `/status/buildinfo` and lands
you on Explore.

## Self-hosting

Everything needed is in the repo:

```bash
git clone https://github.com/denysvitali/loki-ui
cd loki-ui
pnpm install
VITE_BASE_PATH=/ pnpm build
# dist/ is a static bundle. Serve it with any static host.
```

`VITE_BASE_PATH` controls the SPA base path. For a repo-named GitHub Pages
project site set it to `/loki-ui/` (the default). For a root deployment or
your own Pages repo, set it to `/`.

## Development

Requires Node ≥ 22 and pnpm.

```bash
docker compose -f examples/docker-compose.dev.yml up -d
pnpm install
pnpm dev
# Open http://localhost:5173, connect to http://localhost:3101, no auth
```

### Scripts

- `pnpm dev` — Vite dev server.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm test` — Vitest unit + integration tests.
- `pnpm build` — type-check + production build into `dist/`.
- `pnpm preview` — serve the built bundle.

### Tests

We run unit tests for the pure-logic targets (Loki client, error
classification, time grammar, URL codec, structured-log parser, step
selection, history ring buffer, selector editing, export formats).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Short version: Conventional
Commits, PRs not direct pushes to `main`, CI green, no unrequested
features.

## Security

See [SECURITY.md](./SECURITY.md). TL;DR: report privately via
[GitHub Security Advisories](https://github.com/denysvitali/loki-ui/security/advisories/new),
don't open public issues for vulnerabilities.

## License

Apache-2.0. See [LICENSE](./LICENSE).
