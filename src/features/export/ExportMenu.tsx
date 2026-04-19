import { useEffect, useRef, useState } from 'react';
import type { MatrixSeries, Stream } from '@/lib/loki';
import {
  exportFilename,
  matrixToCSV,
  matrixToNDJSON,
  toNDJSON,
  toPlainText,
  triggerDownload,
  type ExportContext,
} from './format';

interface StreamsMenuProps {
  streams: Stream[];
  ctx: ExportContext;
}

interface MatrixMenuProps {
  series: MatrixSeries[];
  ctx: ExportContext;
}

export function StreamsExportMenu({ streams, ctx }: StreamsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const disabled = streams.every((s) => s.values.length === 0);

  const doExport = (kind: 'ndjson' | 'txt') => {
    const content = kind === 'ndjson' ? toNDJSON(streams, ctx) : toPlainText(streams, ctx);
    triggerDownload(content, exportFilename(ctx.datasourceName, kind));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-3 rounded-md text-xs font-medium bg-background border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Export ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-48 rounded-md border border-border bg-card shadow-xl z-40 py-1"
        >
          <ExportItem onClick={() => doExport('ndjson')}>NDJSON</ExportItem>
          <ExportItem onClick={() => doExport('txt')}>Plain text</ExportItem>
        </div>
      )}
    </div>
  );
}

export function MatrixExportMenu({ series, ctx }: MatrixMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const doExport = (kind: 'ndjson' | 'csv') => {
    const content =
      kind === 'ndjson' ? matrixToNDJSON(series, ctx) : matrixToCSV(series, ctx);
    triggerDownload(content, exportFilename(ctx.datasourceName, kind));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-3 rounded-md text-xs font-medium bg-background border border-border text-muted-foreground hover:bg-muted"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Export ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-48 rounded-md border border-border bg-card shadow-xl z-40 py-1"
        >
          <ExportItem onClick={() => doExport('csv')}>CSV</ExportItem>
          <ExportItem onClick={() => doExport('ndjson')}>NDJSON</ExportItem>
        </div>
      )}
    </div>
  );
}

function ExportItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-muted"
    >
      {children}
    </button>
  );
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  cb: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) cb();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, cb, enabled]);
}
