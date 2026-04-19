import { useEffect, useRef, useState } from 'react';
import { parseTime } from '@/lib/time/grammar';

interface TimeRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

const QUICK_RANGES: Array<[label: string, from: string, to: string]> = [
  ['Last 5m', 'now-5m', 'now'],
  ['Last 15m', 'now-15m', 'now'],
  ['Last 30m', 'now-30m', 'now'],
  ['Last 1h', 'now-1h', 'now'],
  ['Last 3h', 'now-3h', 'now'],
  ['Last 6h', 'now-6h', 'now'],
  ['Last 12h', 'now-12h', 'now'],
  ['Last 24h', 'now-24h', 'now'],
  ['Last 2d', 'now-2d', 'now'],
  ['Last 7d', 'now-7d', 'now'],
];

const SNAPPED: Array<[label: string, from: string, to: string]> = [
  ['Today', 'now/d', 'now'],
  ['Yesterday', 'now/d-1d', 'now/d'],
  ['This week', 'now/w', 'now'],
  ['Last week', 'now/w-1w', 'now/w'],
];

export function TimeRangePicker({ from, to, onChange }: TimeRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const apply = () => {
    try {
      parseTime(draftFrom);
      parseTime(draftTo);
    } catch (err) {
      alert(`Invalid time: ${err instanceof Error ? err.message : err}`);
      return;
    }
    onChange(draftFrom, draftTo);
    setOpen(false);
  };

  const applyQuick = (f: string, t: string) => {
    onChange(f, t);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-background text-sm text-foreground hover:bg-muted transition-colors"
      >
        <ClockIcon />
        <span className="font-mono">
          {from} → {to}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-[28rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-card shadow-xl z-50 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">From</label>
              <input
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && apply()}
                className={inputClass}
                spellCheck={false}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">To</label>
              <input
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && apply()}
                className={inputClass}
                spellCheck={false}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-subtle-foreground mb-1.5 uppercase tracking-wider">
                Quick ranges
              </div>
              <ul className="space-y-0.5">
                {QUICK_RANGES.map(([label, f, t]) => (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => applyQuick(f, t)}
                      className="w-full text-left px-2 py-1 rounded hover:bg-muted text-foreground"
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-subtle-foreground mb-1.5 uppercase tracking-wider">
                Snapped
              </div>
              <ul className="space-y-0.5">
                {SNAPPED.map(([label, f, t]) => (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => applyQuick(f, t)}
                      className="w-full text-left px-2 py-1 rounded hover:bg-muted text-foreground"
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
            <p className="text-xs text-subtle-foreground">
              Supports <code className="font-mono">now-15m</code>,{' '}
              <code className="font-mono">now/d</code>, ISO-8601, ns epoch.
            </p>
            <button
              type="button"
              onClick={apply}
              className="h-7 px-3 rounded-md text-xs font-medium bg-accent text-accent-foreground hover:opacity-90"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'h-8 px-2 rounded-md bg-background border border-input text-foreground font-mono text-sm placeholder:text-subtle-foreground focus:border-ring focus:outline-none';

function ClockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
