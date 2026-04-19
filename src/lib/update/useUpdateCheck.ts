import { useEffect, useRef, useState } from 'react';

/**
 * Periodically HEAD `/index.html` under the app's own base path. When the
 * ETag / Last-Modified changes, a new build has shipped. See PLAN §2.5
 * and §4 "Long-lived tabs".
 *
 * Only polls while the document is visible to avoid burning cycles on
 * background tabs.
 */
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useUpdateAvailable(): {
  available: boolean;
  dismiss: () => void;
  reload: () => void;
} {
  const [available, setAvailable] = useState(false);
  const initialEtagRef = useRef<string | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // If we're running from a dev server, skip.
    if (import.meta.env.DEV) return;

    const url = indexUrl();
    let cancelled = false;

    const probe = async () => {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
        if (!res.ok) return;
        const tag =
          res.headers.get('etag') ??
          res.headers.get('last-modified') ??
          null;
        if (initialEtagRef.current == null) {
          initialEtagRef.current = tag;
          return;
        }
        if (tag && tag !== initialEtagRef.current && !dismissedRef.current) {
          setAvailable(true);
        }
      } catch {
        /* ignore — we'll try again later */
      }
    };

    probe();
    const id = setInterval(probe, POLL_INTERVAL_MS);
    const onVis = () => {
      if (!document.hidden) probe();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return {
    available,
    dismiss: () => {
      dismissedRef.current = true;
      setAvailable(false);
    },
    reload: () => {
      window.location.reload();
    },
  };
}

function indexUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const u = new URL(base, window.location.origin);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u.toString();
}
