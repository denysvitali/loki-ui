import { useEffect, useState } from 'react';
import {
  DEFAULT_URL_STATE,
  buildHash,
  decodeUrlState,
  encodeUrlState,
  parseHash,
  type UrlState,
} from './url';

function readFromHash(): UrlState {
  if (typeof window === 'undefined') return structuredClone(DEFAULT_URL_STATE);
  const { search } = parseHash(window.location.hash);
  return decodeUrlState(search);
}

/**
 * URL state as a React state hook. Writes back to `location.hash` in an
 * effect — the hash is the source of truth across reloads. Listens for
 * `hashchange` so back/forward work.
 */
export function useUrlState(): [UrlState, (updater: (prev: UrlState) => UrlState) => void] {
  const [state, setState] = useState<UrlState>(readFromHash);

  useEffect(() => {
    const onHashChange = () => setState(readFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const update = (updater: (prev: UrlState) => UrlState) => {
    setState((prev) => {
      const next = updater(prev);
      const { path } = parseHash(window.location.hash);
      const search = encodeUrlState(next);
      const target = buildHash(path || '/explore', search);
      if (target !== window.location.hash) {
        history.replaceState(null, '', target);
      }
      return next;
    });
  };

  return [state, update];
}
