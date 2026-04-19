import { beforeEach, describe, expect, it } from 'vitest';
import {
  addDatasource,
  clearAllCredentials,
  getActiveDatasource,
  listDatasources,
  loadCredentials,
  migrate,
  removeDatasource,
  setActiveDatasource,
  updateDatasource,
  __resetForTests,
} from './datasources';

beforeEach(() => {
  __resetForTests();
});

describe('migrate', () => {
  it('writes current schema version on first run (no-op)', () => {
    migrate();
    expect(localStorage.getItem('loki-ui:schemaVersion')).toBe('1');
  });

  it('is idempotent', () => {
    migrate();
    migrate();
    expect(localStorage.getItem('loki-ui:schemaVersion')).toBe('1');
  });
});

describe('datasource CRUD', () => {
  it('starts empty', () => {
    expect(listDatasources()).toEqual([]);
    expect(getActiveDatasource()).toBeNull();
  });

  it('adds a datasource and marks it active', () => {
    const ds = addDatasource(
      {
        name: 'prod',
        url: 'http://loki:3100',
        authType: 'none',
        credentialTier: 'ephemeral',
      },
      {},
    );
    expect(ds.id).toBeTruthy();
    expect(listDatasources()).toHaveLength(1);
    expect(getActiveDatasource()?.id).toBe(ds.id);
  });

  it('updates a datasource in place', () => {
    const ds = addDatasource(
      {
        name: 'prod',
        url: 'http://loki:3100',
        authType: 'none',
        credentialTier: 'ephemeral',
      },
      {},
    );
    const updated = updateDatasource(ds.id, { name: 'production' });
    expect(updated?.name).toBe('production');
    expect(listDatasources()[0]!.name).toBe('production');
  });

  it('removes a datasource and falls back to another as active', () => {
    const a = addDatasource(
      {
        name: 'a',
        url: 'http://a',
        authType: 'none',
        credentialTier: 'ephemeral',
      },
      {},
    );
    const b = addDatasource(
      {
        name: 'b',
        url: 'http://b',
        authType: 'none',
        credentialTier: 'ephemeral',
      },
      {},
    );
    setActiveDatasource(a.id);
    removeDatasource(a.id);
    expect(listDatasources().map((d) => d.id)).toEqual([b.id]);
    expect(getActiveDatasource()?.id).toBe(b.id);
  });
});

describe('credential tiers', () => {
  it('ephemeral creds stay in memory only', () => {
    const ds = addDatasource(
      {
        name: 'd',
        url: 'http://d',
        authType: 'bearer',
        credentialTier: 'ephemeral',
      },
      { token: 'abc' },
    );
    expect(loadCredentials(ds.id, 'ephemeral')).toEqual({ token: 'abc' });
    // Neither storage backing has it
    expect(sessionStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeNull();
    expect(localStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeNull();
  });

  it('session creds land in sessionStorage only', () => {
    const ds = addDatasource(
      {
        name: 'd',
        url: 'http://d',
        authType: 'bearer',
        credentialTier: 'session',
      },
      { token: 'abc' },
    );
    expect(sessionStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeTruthy();
    expect(localStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeNull();
    expect(loadCredentials(ds.id, 'session')).toEqual({ token: 'abc' });
  });

  it('persistent creds land in localStorage only', () => {
    const ds = addDatasource(
      {
        name: 'd',
        url: 'http://d',
        authType: 'basic',
        credentialTier: 'persistent',
      },
      { username: 'u', password: 'p' },
    );
    expect(localStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeTruthy();
    expect(sessionStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeNull();
    expect(loadCredentials(ds.id, 'persistent')).toEqual({
      username: 'u',
      password: 'p',
    });
  });

  it('changing tier moves creds and clears the old tier', () => {
    const ds = addDatasource(
      {
        name: 'd',
        url: 'http://d',
        authType: 'bearer',
        credentialTier: 'session',
      },
      { token: 'abc' },
    );
    updateDatasource(
      ds.id,
      { credentialTier: 'persistent' },
      { token: 'abc' },
    );
    expect(sessionStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeNull();
    expect(localStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeTruthy();
  });

  it('removing a datasource clears all credential tiers', () => {
    const ds = addDatasource(
      {
        name: 'd',
        url: 'http://d',
        authType: 'bearer',
        credentialTier: 'persistent',
      },
      { token: 'abc' },
    );
    removeDatasource(ds.id);
    expect(localStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeNull();
  });

  it('clearAllCredentials wipes every tier for a datasource', () => {
    const ds = addDatasource(
      {
        name: 'd',
        url: 'http://d',
        authType: 'bearer',
        credentialTier: 'session',
      },
      { token: 'abc' },
    );
    // Force-add persistent residue
    localStorage.setItem(`loki-ui:creds:${ds.id}`, '{"token":"stale"}');
    clearAllCredentials(ds.id);
    expect(sessionStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeNull();
    expect(localStorage.getItem(`loki-ui:creds:${ds.id}`)).toBeNull();
  });
});
