import { useEffect, useState } from 'react';

interface Shortcut {
  keys: string[];
  description: string;
}

const SECTIONS: Array<{ title: string; shortcuts: Shortcut[] }> = [
  {
    title: 'Editor',
    shortcuts: [
      { keys: ['Ctrl/⌘', 'Enter'], description: 'Run query' },
      { keys: ['Ctrl/⌘', 'H'], description: 'Open query history' },
      { keys: ['↑'], description: 'Open history (empty editor)' },
    ],
  },
  {
    title: 'Time range',
    shortcuts: [
      { keys: ['['], description: 'Shift window left' },
      { keys: [']'], description: 'Shift window right' },
      { keys: ['-'], description: 'Zoom out 2×' },
      { keys: ['='], description: 'Zoom in 2×' },
    ],
  },
  {
    title: 'Labels sidebar',
    shortcuts: [
      { keys: ['/'], description: 'Focus label search' },
      { keys: ['Click'], description: 'Insert label="value"' },
      { keys: ['Alt', 'Click'], description: 'Insert label!="value"' },
      { keys: ['Shift', 'Click'], description: 'Insert label=~"value"' },
    ],
  },
  {
    title: 'Log rows',
    shortcuts: [
      { keys: ['Click row'], description: 'Expand / collapse' },
      { keys: ['c'], description: 'Open context panel' },
    ],
  },
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: ['?'], description: 'Show this help' },
      { keys: ['Esc'], description: 'Close popovers / modals' },
    ],
  },
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-title"
      className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm grid place-items-center"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-shortcut-panel]')) return;
        onClose();
      }}
    >
      <div
        data-shortcut-panel
        className="w-full max-w-xl m-4 rounded-lg border border-border bg-card shadow-2xl"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 id="shortcut-title" className="text-lg font-semibold text-foreground">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            ×
          </button>
        </header>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-auto">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs uppercase tracking-wider text-subtle-foreground mb-2">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.shortcuts.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-foreground">{s.description}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <Kbd key={j}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Global `?`-key listener that opens the help modal on demand. */
export function useShortcutHelp(): {
  open: boolean;
  show: () => void;
  hide: () => void;
} {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const target = e.target as HTMLElement | null;
      // Don't hijack when user is typing.
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA')
        return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return {
    open,
    show: () => setOpen(true),
    hide: () => setOpen(false),
  };
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center h-5 px-1.5 text-[11px] font-mono rounded border border-border bg-muted text-foreground">
      {children}
    </kbd>
  );
}
