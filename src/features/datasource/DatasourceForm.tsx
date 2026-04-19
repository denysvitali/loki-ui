import { useState, type FormEvent } from 'react';
import { describe as describeError, type AuthType, type Credentials } from '@/lib/loki';
import {
  addDatasource,
  type CredentialTier,
  type StoredDatasource,
  updateDatasource,
} from '@/lib/state/datasources';
import { probeDatasource } from './probe';

interface DatasourceFormProps {
  /** When provided, the form edits this datasource; otherwise it adds a new one. */
  existing?: StoredDatasource;
  /** Called after a successful save (with the stored id). */
  onSaved: (id: string) => void;
  onCancel?: () => void;
}

export function DatasourceForm({
  existing,
  onSaved,
  onCancel,
}: DatasourceFormProps) {
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? 'http://localhost:3100');
  const [authType, setAuthType] = useState<AuthType>(existing?.authType ?? 'none');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [tenant, setTenant] = useState(existing?.tenant ?? '');
  const [cookieAuth, setCookieAuth] = useState(existing?.cookieAuth ?? false);
  const [tier, setTier] = useState<CredentialTier>(
    existing?.credentialTier ?? 'session',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setVersion(null);
    setBusy(true);

    const trimmedUrl = url.trim().replace(/\/+$/, '');
    const trimmedName = name.trim() || defaultNameFromUrl(trimmedUrl);
    const creds: Credentials = {};
    if (authType === 'basic') {
      if (username) creds.username = username;
      if (password) creds.password = password;
    } else if (authType === 'bearer') {
      if (token) creds.token = token;
    }

    const datasourceProbe = {
      id: existing?.id ?? 'probe',
      name: trimmedName,
      url: trimmedUrl,
      authType,
      ...(tenant.trim() ? { tenant: tenant.trim() } : {}),
      ...(cookieAuth ? { cookieAuth: true } : {}),
    };

    const result = await probeDatasource(datasourceProbe, creds);

    if (!result.ok) {
      setBusy(false);
      setError(describeError(result.error));
      return;
    }

    setVersion(result.buildInfo.version);

    if (tier === 'persistent') {
      const confirmed = confirm(
        'Persistent credentials are stored in localStorage on this device. ' +
          "On github.io, that's a shared origin with other GitHub Pages sites " +
          '(see SECURITY.md). Continue?',
      );
      if (!confirmed) {
        setBusy(false);
        return;
      }
    }

    const input = {
      name: trimmedName,
      url: trimmedUrl,
      authType,
      credentialTier: tier,
      ...(tenant.trim() ? { tenant: tenant.trim() } : {}),
      ...(cookieAuth ? { cookieAuth } : {}),
    };

    const saved = existing
      ? updateDatasource(existing.id, input, creds)
      : addDatasource(input, creds);

    setBusy(false);
    if (saved) onSaved(saved.id);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="ds-name">Name</Label>
        <input
          id="ds-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. prod-loki"
          className={inputClass}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ds-url">Base URL</Label>
        <input
          id="ds-url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:3100"
          className={`${inputClass} font-mono text-sm`}
        />
        <HelpText>No trailing slash. Must be CORS-enabled (see README).</HelpText>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm text-muted-foreground">Authentication</legend>
        <div className="flex gap-3 text-sm">
          {(['none', 'basic', 'bearer'] as const).map((t) => (
            <label
              key={t}
              className="inline-flex items-center gap-1.5 cursor-pointer"
            >
              <input
                type="radio"
                name="auth"
                value={t}
                checked={authType === t}
                onChange={() => setAuthType(t)}
              />
              <span className="capitalize">{t}</span>
            </label>
          ))}
        </div>

        {authType === 'basic' && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className={inputClass}
            />
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={inputClass}
            />
          </div>
        )}

        {authType === 'bearer' && (
          <input
            type="password"
            placeholder="bearer token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            className={`${inputClass} font-mono text-sm`}
          />
        )}
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="ds-tenant">X-Scope-OrgID (optional)</Label>
        <input
          id="ds-tenant"
          type="text"
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
          placeholder="tenant-a or tenant-a|tenant-b"
          className={`${inputClass} font-mono text-sm`}
        />
      </div>

      {authType !== 'none' && (
        <fieldset className="grid gap-2">
          <legend className="text-sm text-muted-foreground">
            Remember credentials
          </legend>
          <div className="grid gap-1.5 text-sm">
            <TierOption
              value="ephemeral"
              current={tier}
              onChange={setTier}
              label="Ask each session (recommended)"
              hint="In-memory only; re-enter after reload."
            />
            <TierOption
              value="session"
              current={tier}
              onChange={setTier}
              label="Remember this session"
              hint="sessionStorage — survives reload, dies on tab close."
            />
            <TierOption
              value="persistent"
              current={tier}
              onChange={setTier}
              label="Remember on this device"
              hint="localStorage — warning dialog explains shared-origin risk on github.io."
            />
          </div>
        </fieldset>
      )}

      {authType !== 'none' && (
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={cookieAuth}
            onChange={(e) => setCookieAuth(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            My proxy sets an auth cookie upstream{' '}
            <span className="text-subtle-foreground">
              — enables live tail under basic/bearer auth (PLAN §3.3).
            </span>
          </span>
        </label>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-level-error)]/40 bg-[var(--color-level-error)]/10 px-3 py-2 text-sm text-[var(--color-level-error)]"
        >
          {error}
        </div>
      )}

      {version && !error && (
        <div
          role="status"
          className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent"
        >
          Connected — Loki {version}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-4 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !url}
          className="h-9 px-4 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {busy ? 'Connecting…' : existing ? 'Save' : 'Connect'}
        </button>
      </div>
    </form>
  );
}

interface TierOptionProps {
  value: CredentialTier;
  current: CredentialTier;
  onChange: (v: CredentialTier) => void;
  label: string;
  hint: string;
}

function TierOption({ value, current, onChange, label, hint }: TierOptionProps) {
  const id = `tier-${value}`;
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="radio"
        name="tier"
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        className="mt-0.5"
      />
      <label htmlFor={id} className="cursor-pointer">
        <span className="text-foreground">{label}</span>
        <span className="block text-subtle-foreground text-xs">{hint}</span>
      </label>
    </div>
  );
}

function Label(props: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={props.htmlFor} className="text-sm text-muted-foreground">
      {props.children}
    </label>
  );
}

function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-subtle-foreground">{children}</p>;
}

const inputClass =
  'h-9 px-3 rounded-md bg-background border border-input text-foreground ' +
  'placeholder:text-subtle-foreground ' +
  'focus:border-ring focus:outline-none transition-colors';

function defaultNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host || 'Loki';
  } catch {
    return 'Loki';
  }
}
