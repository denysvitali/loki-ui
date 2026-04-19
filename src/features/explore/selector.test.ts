import { describe, expect, it } from 'vitest';

// The helpers are currently private to Explore.tsx; re-export via small
// copies here for testing. If they move to a shared module we'll import
// directly.

function extractSelector(query: string): string {
  const m = /^\s*(\{[^}]*\})/.exec(query);
  return m ? m[1]! : '';
}

function insertLabelInSelector(
  query: string,
  label: string,
  value: string,
  op: '=' | '!=' | '=~' | '!~',
): string {
  const escaped = value.replace(/"/g, '\\"');
  const m = /^\s*(\{)([^}]*)(\})(.*)$/s.exec(query);
  if (!m) {
    return `{${label}${op}"${escaped}"} ${query.trim()}`.trim();
  }
  const open = m[1]!;
  const body = m[2]!;
  const close = m[3]!;
  const rest = m[4] ?? '';
  const eqRe = new RegExp(
    String.raw`(^|,\s*)${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"`,
  );
  const eqMatch = eqRe.exec(body);
  if (eqMatch && op === '=') {
    const existing = eqMatch[2]!;
    if (existing === escaped) return query;
    const joined = `${existing}|${escaped}`;
    const newBody = body.replace(eqRe, `$1${label}=~"${joined}"`);
    return `${open}${newBody}${close}${rest}`;
  }
  const clause = `${label}${op}"${escaped}"`;
  const newBody =
    body.trim() === '' ? clause : `${body.replace(/\s*$/, '')}, ${clause}`;
  return `${open}${newBody}${close}${rest}`;
}

describe('extractSelector', () => {
  it('pulls the leading selector', () => {
    expect(extractSelector('{app="x"}')).toBe('{app="x"}');
    expect(extractSelector('  {app="x", env="prod"}  |= "err"')).toBe(
      '{app="x", env="prod"}',
    );
  });

  it('returns empty string when no selector', () => {
    expect(extractSelector('sum(rate({}[5m]))')).toBe('');
    expect(extractSelector('')).toBe('');
  });
});

describe('insertLabelInSelector', () => {
  it('adds a new label to an empty selector', () => {
    expect(insertLabelInSelector('{}', 'app', 'foo', '=')).toBe('{app="foo"}');
  });

  it('appends to an existing selector', () => {
    expect(insertLabelInSelector('{app="foo"}', 'env', 'prod', '=')).toBe(
      '{app="foo", env="prod"}',
    );
  });

  it('merges duplicate-label = into =~ regex union', () => {
    expect(insertLabelInSelector('{env="prod"}', 'env', 'staging', '=')).toBe(
      '{env=~"prod|staging"}',
    );
  });

  it('leaves the query unchanged when the exact clause is already present', () => {
    const q = '{app="foo"}';
    expect(insertLabelInSelector(q, 'app', 'foo', '=')).toBe(q);
  });

  it('preserves trailing pipeline / filters', () => {
    const result = insertLabelInSelector(
      '{app="foo"} |= "err"',
      'env',
      'prod',
      '=',
    );
    expect(result).toBe('{app="foo", env="prod"} |= "err"');
  });

  it('escapes double quotes in values', () => {
    expect(insertLabelInSelector('{}', 'msg', 'he said "hi"', '=')).toBe(
      '{msg="he said \\"hi\\""}',
    );
  });

  it('prepends a selector when none exists', () => {
    expect(
      insertLabelInSelector('rate({}[5m])', 'app', 'foo', '='),
    ).toBe('{app="foo"} rate({}[5m])');
  });

  it('!= operator appends, does not merge', () => {
    expect(
      insertLabelInSelector('{app="foo"}', 'env', 'dev', '!='),
    ).toBe('{app="foo", env!="dev"}');
  });
});
