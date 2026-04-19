export function App() {
  return (
    <main className="min-h-dvh grid place-items-center px-6 py-16">
      <div className="max-w-xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400 tracking-wide">
          <span className="size-1.5 rounded-full bg-teal-400 animate-pulse" />
          scaffolding — v0.0.0
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">
          loki-ui
        </h1>
        <p className="text-zinc-400 leading-relaxed">
          A better frontend for Grafana Loki. Static SPA on GitHub Pages, no
          backend. Points at any Loki you configure.
        </p>
        <p className="text-sm text-zinc-500">
          UI is not implemented yet. Follow progress on{' '}
          <a
            className="text-teal-400 hover:text-teal-300 underline underline-offset-4"
            href="https://github.com/denysvitali/loki-ui"
          >
            GitHub
          </a>
          .
        </p>
      </div>
    </main>
  );
}
