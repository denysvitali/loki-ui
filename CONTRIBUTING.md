# Contributing to loki-ui

Thanks for considering a contribution.

## Development

Requires Node ≥ 22 and pnpm.

```bash
pnpm install
pnpm dev     # Vite dev server on http://localhost:5173
```

### Against a real Loki

A docker-compose with Loki + Caddy (CORS) + canary is on the roadmap
(see [PLAN.md §2.4](./PLAN.md) and §4.1). Until it lands, point the app
at any Loki instance fronted by a CORS-aware proxy.

### Scripts

- `pnpm typecheck` — `tsc --noEmit`
- `pnpm build` — type-check + production build
- `pnpm preview` — serve `dist/`

## Commit style

Conventional Commits required. Examples:

- `feat(explore): add histogram drag-to-zoom`
- `fix(loki): retry on 429 with Retry-After`
- `docs(plan): clarify tail auth matrix`
- `chore(deps): bump vite to 6.4`

Release automation (release-please) generates `CHANGELOG.md` and version
bumps from commit history, so keep messages informative.

## PRs

- Keep PRs focused. A feature-sized PR is fine; a branch-sized PR is
  harder to review.
- CI must be green (typecheck + build today; lint + tests soon).
- For UI changes, please include a short note on what you manually
  verified in a browser.
- Don't push to `main` directly — open a PR.
