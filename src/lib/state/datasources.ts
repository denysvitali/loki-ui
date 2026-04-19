import type { AuthType, Credentials, Datasource } from '@/lib/loki';

/**
 * Datasource storage.
 *
 * Metadata (URL, auth type, tenant, name, id, credential tier) always lives
 * in localStorage. Credentials live in one of three tiers chosen per
 * datasource at save time — see PLAN §3.2:
 *
 *   - 'ephemeral'  → module-level Map; dies on page reload / tab close
 *   - 'session'    → sessionStorage; survives reload, dies on tab close
 *   - 'persistent' → localStorage (warning dialog on save)
 *
 * All state changes fire a `loki-ui:datasources-changed` CustomEvent so
 * React hooks can re-render; cross-tab sync uses the native 'storage'
 * event, which we translate into the same custom event.
 */

export type CredentialTier = 'ephemeral' | 'session' | 'persistent';

export interface StoredDatasource {
  id: string;
  name: string;
  url: string;
  authType: AuthType;
  tenant?: string;
  cookieAuth?: boolean;
  credentialTier: CredentialTier;
}

export interface DatasourceState {
  schemaVersion: 1;
  datasources: StoredDatasource[];
  activeId: string | null;
}

const LS_KEY = 'loki-ui:datasources';
const SCHEMA_KEY = 'loki-ui:schemaVersion';
const CURRENT_SCHEMA: 1 = 1;
const CHANGED_EVENT = 'loki-ui:datasources-changed';

const ephemeralCreds = new Map<string, Credentials>();

// ----- schema migration scaffold -----------------------------------------

/**
 * Runs on boot. No-op today. When we introduce a schema change we add a
 * step here that reads the previous shape and writes the new one.
 */
export function migrate(): void {
  let stored: number | null = null;
  try {
    const raw = localStorage.getItem(SCHEMA_KEY);
    stored = raw ? Number(raw) : null;
  } catch {
    return;
  }
  if (stored === CURRENT_SCHEMA) return;
  // No migrations to run yet. Write the current version.
  try {
    localStorage.setItem(SCHEMA_KEY, String(CURRENT_SCHEMA));
  } catch {
    /* noop */
  }
}

// ----- metadata CRUD ------------------------------------------------------

export function readState(): DatasourceState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as DatasourceState;
    if (parsed.schemaVersion !== CURRENT_SCHEMA) return empty();
    return parsed;
  } catch {
    return empty();
  }
}

function empty(): DatasourceState {
  return { schemaVersion: CURRENT_SCHEMA, datasources: [], activeId: null };
}

function writeState(state: DatasourceState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — intentionally silent, state stays in memory via event */
  }
  notify();
}

export function listDatasources(): StoredDatasource[] {
  return readState().datasources;
}

export function getActiveDatasource(): StoredDatasource | null {
  const s = readState();
  if (!s.activeId) return null;
  return s.datasources.find((d) => d.id === s.activeId) ?? null;
}

export function addDatasource(
  input: Omit<StoredDatasource, 'id'>,
  creds: Credentials,
): StoredDatasource {
  const id = generateId();
  const ds: StoredDatasource = { ...input, id };
  const s = readState();
  s.datasources.push(ds);
  s.activeId = id;
  writeState(s);
  storeCredentials(id, ds.credentialTier, creds);
  return ds;
}

export function updateDatasource(
  id: string,
  patch: Partial<Omit<StoredDatasource, 'id'>>,
  creds?: Credentials,
): StoredDatasource | null {
  const s = readState();
  const i = s.datasources.findIndex((d) => d.id === id);
  if (i < 0) return null;
  const prev = s.datasources[i]!;
  const next: StoredDatasource = { ...prev, ...patch };
  s.datasources[i] = next;
  writeState(s);
  if (creds) {
    // Clear old-tier creds if the tier changed.
    if (patch.credentialTier && patch.credentialTier !== prev.credentialTier) {
      clearCredentialsFromTier(id, prev.credentialTier);
    }
    storeCredentials(id, next.credentialTier, creds);
  }
  return next;
}

export function removeDatasource(id: string): void {
  const s = readState();
  s.datasources = s.datasources.filter((d) => d.id !== id);
  if (s.activeId === id) s.activeId = s.datasources[0]?.id ?? null;
  writeState(s);
  clearAllCredentials(id);
}

export function setActiveDatasource(id: string | null): void {
  const s = readState();
  if (id !== null && !s.datasources.some((d) => d.id === id)) return;
  s.activeId = id;
  writeState(s);
}

// ----- credential tiers ---------------------------------------------------

export function storeCredentials(
  id: string,
  tier: CredentialTier,
  creds: Credentials,
): void {
  // Always clear other tiers so a tier change leaves no residue.
  clearCredentialsFromTier(id, tier === 'session' ? 'persistent' : 'session');
  ephemeralCreds.delete(id);

  const compact = stripEmpty(creds);
  if (!compact) return;

  switch (tier) {
    case 'ephemeral':
      ephemeralCreds.set(id, compact);
      return;
    case 'session':
      try {
        sessionStorage.setItem(credKey(id), JSON.stringify(compact));
      } catch {
        /* noop */
      }
      return;
    case 'persistent':
      try {
        localStorage.setItem(credKey(id), JSON.stringify(compact));
      } catch {
        /* noop */
      }
      return;
  }
}

export function loadCredentials(
  id: string,
  tier: CredentialTier,
): Credentials {
  if (tier === 'ephemeral') {
    return ephemeralCreds.get(id) ?? {};
  }
  const store = tier === 'session' ? sessionStorage : localStorage;
  try {
    const raw = store.getItem(credKey(id));
    return raw ? (JSON.parse(raw) as Credentials) : {};
  } catch {
    return {};
  }
}

export function clearAllCredentials(id: string): void {
  ephemeralCreds.delete(id);
  try {
    sessionStorage.removeItem(credKey(id));
  } catch {
    /* noop */
  }
  try {
    localStorage.removeItem(credKey(id));
  } catch {
    /* noop */
  }
}

function clearCredentialsFromTier(id: string, tier: CredentialTier): void {
  switch (tier) {
    case 'ephemeral':
      ephemeralCreds.delete(id);
      return;
    case 'session':
      try {
        sessionStorage.removeItem(credKey(id));
      } catch {
        /* noop */
      }
      return;
    case 'persistent':
      try {
        localStorage.removeItem(credKey(id));
      } catch {
        /* noop */
      }
      return;
  }
}

function credKey(id: string): string {
  return `loki-ui:creds:${id}`;
}

function stripEmpty(c: Credentials): Credentials | null {
  const out: Credentials = {};
  if (c.username) out.username = c.username;
  if (c.password) out.password = c.password;
  if (c.token) out.token = c.token;
  return Object.keys(out).length > 0 ? out : null;
}

// ----- conversion helpers -------------------------------------------------

export function toDatasource(s: StoredDatasource): Datasource {
  return {
    id: s.id,
    name: s.name,
    url: s.url,
    authType: s.authType,
    ...(s.tenant ? { tenant: s.tenant } : {}),
    ...(s.cookieAuth ? { cookieAuth: s.cookieAuth } : {}),
  };
}

// ----- change notification ------------------------------------------------

function notify(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

/**
 * Subscribe to any datasource-state change (this tab or another).
 * Returns an unsubscribe function.
 */
export function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY || e.key === SCHEMA_KEY || e.key?.startsWith('loki-ui:creds:')) {
      listener();
    }
  };
  window.addEventListener(CHANGED_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

// ----- test seam ----------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Test-only: reset all state. Not exported from index.ts. */
export function __resetForTests(): void {
  ephemeralCreds.clear();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* noop */
  }
}
