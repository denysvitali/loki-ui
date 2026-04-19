import { describe, expect, it } from 'vitest';
import { detectContext } from './completion';

function ctx(input: string) {
  const cursor = input.indexOf('|');
  if (cursor < 0) throw new Error('test string must include | as cursor marker');
  const before = input.replace('|', '');
  return detectContext(before, cursor);
}

describe('detectContext — label name', () => {
  it('immediately after `{`', () => {
    const r = ctx('{|');
    expect(r?.kind).toBe('label-name');
    expect((r as { typed: string }).typed).toBe('');
  });

  it('typing an identifier', () => {
    const r = ctx('{ap|');
    expect(r?.kind).toBe('label-name');
    if (r?.kind === 'label-name') {
      expect(r.typed).toBe('ap');
      // `from` is cursor - typed.length
      expect(r.from).toBe(1);
    }
  });

  it('after a comma', () => {
    const r = ctx('{app="foo", ns|');
    expect(r?.kind).toBe('label-name');
    if (r?.kind === 'label-name') expect(r.typed).toBe('ns');
  });
});

describe('detectContext — label value', () => {
  it('after =', () => {
    const r = ctx('{app="f|');
    expect(r?.kind).toBe('label-value');
    if (r?.kind === 'label-value') {
      expect(r.label).toBe('app');
      expect(r.typed).toBe('f');
    }
  });

  it('after =~', () => {
    const r = ctx('{app=~"(foo|b|');
    expect(r?.kind).toBe('label-value');
    if (r?.kind === 'label-value') {
      expect(r.label).toBe('app');
      expect(r.typed).toBe('(foo|b');
    }
  });

  it('after !=', () => {
    const r = ctx('{env!="st|');
    expect(r?.kind).toBe('label-value');
    if (r?.kind === 'label-value') {
      expect(r.label).toBe('env');
      expect(r.typed).toBe('st');
    }
  });

  it('returns null once the value is closed', () => {
    const r = ctx('{app="foo"|');
    expect(r).toBeNull();
  });
});

describe('detectContext — bailouts', () => {
  it('outside any selector', () => {
    expect(ctx('rate(|')).toBeNull();
    expect(ctx('|')).toBeNull();
  });

  it('past the closing brace', () => {
    expect(ctx('{app="foo"} |= "err|')).toBeNull();
  });

  it('inside a pipeline (past the selector)', () => {
    expect(ctx('{app="foo"} | json | level="|')).toBeNull();
  });
});
