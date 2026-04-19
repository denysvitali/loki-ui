# loki-ui

A better frontend for [Grafana Loki](https://grafana.com/oss/loki/). Static SPA
on GitHub Pages. No backend. Points at any Loki instance you configure.

> **Status**: scaffolding. The UI is not implemented yet — follow progress on
> [GitHub](https://github.com/denysvitali/loki-ui).

See [PLAN.md](./PLAN.md) for the v0.1 design and [ROADMAP.md](./ROADMAP.md)
for what comes after.

## Development

Requires Node ≥ 22 and pnpm.

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
pnpm preview
```

The app is served at a `/loki-ui/` base path by default (for GitHub Pages
project sites). Override with `VITE_BASE_PATH=/` for self-hosted root
deployments.

## License

Apache-2.0.
