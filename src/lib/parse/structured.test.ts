import { describe, expect, it } from 'vitest';
import { parseLogfmt, parseStructured } from './structured';

describe('parseStructured — JSON', () => {
  it('parses flat JSON', () => {
    const r = parseStructured('{"level":"info","msg":"hi","n":42}');
    expect(r?.format).toBe('json');
    expect(r?.fields).toEqual({ level: 'info', msg: 'hi', n: 42 });
  });

  it('flattens nested JSON to stringified values', () => {
    const r = parseStructured('{"a":{"b":1}}');
    expect(r?.fields.a).toBe('{"b":1}');
  });

  it('rejects JSON arrays (not object)', () => {
    expect(parseStructured('[1,2,3]')).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(parseStructured('{oops')).toBeNull();
  });
});

describe('parseLogfmt', () => {
  it('parses bare key=value', () => {
    expect(parseLogfmt('level=info msg=hello')).toEqual({
      level: 'info',
      msg: 'hello',
    });
  });

  it('parses quoted values with spaces', () => {
    expect(parseLogfmt('level=info msg="hello world"')).toEqual({
      level: 'info',
      msg: 'hello world',
    });
  });

  it('handles escaped quotes', () => {
    expect(parseLogfmt('msg="she said \\"hi\\""')).toEqual({
      msg: 'she said "hi"',
    });
  });

  it('returns null for unstructured lines', () => {
    expect(parseLogfmt('this is just prose')).toBeNull();
  });
});

describe('parseStructured — logfmt detection', () => {
  it('uses logfmt for non-JSON with >=2 key=value pairs', () => {
    const r = parseStructured('ts=2026-04-19T12:00:00Z level=info msg=ok');
    expect(r?.format).toBe('logfmt');
    expect(r?.fields.level).toBe('info');
  });

  it('requires 2+ fields to avoid false positives', () => {
    expect(parseStructured('foo=1')).toBeNull();
  });
});
