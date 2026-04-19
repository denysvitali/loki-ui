import { describe, expect, it } from 'vitest';
import {
  DEFAULT_URL_STATE,
  buildHash,
  decodeUrlState,
  encodeUrlState,
  parseHash,
  type UrlState,
} from './url';

describe('UrlState codec', () => {
  it('round-trips default state', () => {
    const enc = encodeUrlState(DEFAULT_URL_STATE);
    const dec = decodeUrlState(enc);
    expect(dec).toEqual(DEFAULT_URL_STATE);
  });

  it('round-trips a populated single-pane state', () => {
    const state: UrlState = {
      panes: [
        {
          datasourceId: 'abc',
          query: '{app="foo"} |= "error"',
          from: 'now-15m',
          to: 'now',
        },
      ],
      limit: 2000,
      live: true,
      wrap: true,
      ctx: 'row-123',
    };
    const enc = encodeUrlState(state);
    const dec = decodeUrlState(enc);
    expect(dec).toEqual(state);
  });

  it('round-trips LogQL with pipeline operators (no separator collision)', () => {
    const state: UrlState = {
      ...DEFAULT_URL_STATE,
      panes: [
        {
          datasourceId: 'x',
          query: '{a="b"} |= "c&d" | json | line_format "{{.msg}}"',
          from: 'now-1h',
          to: 'now',
        },
      ],
    };
    expect(decodeUrlState(encodeUrlState(state)).panes[0]!.query).toBe(
      state.panes[0]!.query,
    );
  });

  it('decode is tolerant of missing params', () => {
    expect(decodeUrlState('')).toEqual(DEFAULT_URL_STATE);
    expect(decodeUrlState('ds=abc')).toEqual({
      ...DEFAULT_URL_STATE,
      panes: [
        {
          datasourceId: 'abc',
          query: '',
          from: 'now-1h',
          to: 'now',
        },
      ],
    });
  });

  it('supports two-pane list shape (v0.2 forward-compat)', () => {
    const state: UrlState = {
      panes: [
        {
          datasourceId: 'a',
          query: '{x="y"}',
          from: 'now-1h',
          to: 'now',
        },
        {
          datasourceId: 'b',
          query: '{z="w"}',
          from: 'now-2h',
          to: 'now-1h',
        },
      ],
      limit: 1000,
      live: false,
      wrap: false,
      ctx: null,
    };
    const dec = decodeUrlState(encodeUrlState(state));
    expect(dec.panes).toHaveLength(2);
    expect(dec.panes[1]!.datasourceId).toBe('b');
  });
});

describe('parseHash', () => {
  it('handles empty hash → default path', () => {
    expect(parseHash('')).toEqual({ path: '/explore', search: '' });
    expect(parseHash('#')).toEqual({ path: '/explore', search: '' });
  });

  it('splits path and search', () => {
    expect(parseHash('#/explore?ds=x&q=foo')).toEqual({
      path: '/explore',
      search: 'ds=x&q=foo',
    });
  });

  it('buildHash pairs with parseHash', () => {
    const { path, search } = parseHash('#/explore?q=foo');
    expect(buildHash(path, search)).toBe('#/explore?q=foo');
    expect(buildHash('/explore', '')).toBe('#/explore');
  });
});
