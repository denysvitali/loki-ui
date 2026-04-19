import { describe, expect, it } from 'vitest';
import type { MatrixSeries, Stream } from '@/lib/loki';
import {
  matrixToCSV,
  matrixToNDJSON,
  toNDJSON,
  toPlainText,
} from './format';

const CTX = {
  datasourceName: 'prod',
  query: '{app="foo"}',
  from: 'now-1h',
  to: 'now',
};

const STREAMS: Stream[] = [
  {
    stream: { app: 'foo', env: 'prod' },
    values: [
      ['1713484800000000000', 'hello'],
      ['1713484801000000000', 'world', { trace: 'abc' }],
    ],
  },
];

describe('toNDJSON', () => {
  it('prepends header comments', () => {
    const out = toNDJSON(STREAMS, CTX);
    expect(out).toContain('# loki-ui export');
    expect(out).toContain('# entries: 2');
    expect(out).toContain('# query: {app="foo"}');
  });

  it('emits one JSON object per entry', () => {
    const out = toNDJSON(STREAMS, CTX);
    const bodyLines = out.split('\n').filter((l) => l && !l.startsWith('#'));
    expect(bodyLines).toHaveLength(2);
    const first = JSON.parse(bodyLines[0]!);
    expect(first.ts).toBe('1713484800000000000');
    expect(first.labels).toEqual({ app: 'foo', env: 'prod' });
    expect(first.iso).toMatch(/^2024-\d{2}-\d{2}T/);
  });

  it('includes metadata when present', () => {
    const out = toNDJSON(STREAMS, CTX);
    const withMeta = out
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => JSON.parse(l));
    expect(withMeta[1]!.metadata).toEqual({ trace: 'abc' });
    expect(withMeta[0]!.metadata).toBeUndefined();
  });
});

describe('toPlainText', () => {
  it('emits one tab-separated line per entry in descending time order', () => {
    const out = toPlainText(STREAMS, CTX);
    const body = out.split('\n').filter((l) => l && !l.startsWith('#'));
    expect(body).toHaveLength(2);
    // Newer first
    expect(body[0]).toContain('world');
    expect(body[1]).toContain('hello');
    expect(body[0]).toContain('app=foo');
  });

  it('escapes embedded newlines with double-tab', () => {
    const s: Stream[] = [
      {
        stream: { app: 'x' },
        values: [['1713484800000000000', 'line1\nline2']],
      },
    ];
    const out = toPlainText(s, CTX);
    expect(out).toContain('line1\t\tline2');
    expect(out.split('\n').filter((l) => !l.startsWith('#')).length).toBe(2); // one data + trailing empty
  });
});

describe('matrix formats', () => {
  const SERIES: MatrixSeries[] = [
    {
      metric: { level: 'info' },
      values: [
        [1713484800, '42'],
        [1713484860, '38'],
      ],
    },
    {
      metric: { level: 'error' },
      values: [[1713484860, '2']],
    },
  ];

  it('NDJSON emits one row per point', () => {
    const out = matrixToNDJSON(SERIES, CTX);
    const body = out.split('\n').filter((l) => l && !l.startsWith('#'));
    expect(body).toHaveLength(3);
  });

  it('CSV has one row per union timestamp, one column per series', () => {
    const out = matrixToCSV(SERIES, CTX);
    const body = out.split('\n').filter((l) => l && !l.startsWith('#'));
    // header + 2 timestamps
    expect(body).toHaveLength(3);
    expect(body[0]).toContain('timestamp');
    // Missing value for "error" at the first timestamp is empty
    expect(body[1]!.split(',')[2]).toBe('');
    expect(body[2]!.split(',')[2]).toBe('2');
  });
});
