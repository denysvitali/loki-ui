/**
 * Detect and parse JSON or logfmt from a log line. Used to populate the
 * expanded log-row field tree and the "filter by field" affordance.
 */

export interface ParsedStructured {
  format: 'json' | 'logfmt' | 'tabular';
  fields: Record<string, string | number | boolean | null>;
}

export function parseStructured(line: string): ParsedStructured | null {
  const trimmed = line.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed) as unknown;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const fields: ParsedStructured['fields'] = {};
        for (const [k, v] of Object.entries(obj)) {
          fields[k] = flattenValue(v);
        }
        return { format: 'json', fields };
      }
    } catch {
      /* fall through */
    }
  }
  const tabular = parseTabular(line);
  if (tabular) return tabular;

  const lf = parseLogfmt(line);
  if (lf && Object.keys(lf).length >= 2) return { format: 'logfmt', fields: lf };
  return null;
}

function flattenValue(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return v;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Minimal logfmt parser: `key=value key="quoted value" key=bare_ident`.
 * Not exhaustive; good enough for the common Go / Promtail output.
 */

/**
 * Parse tab-separated structured logs: `TS\tLEVEL\tLOGGER\tMSG\t{JSON?}`.
 * Common with Go slog, Zap, and Kubernetes controller-runtime loggers.
 */
function parseTabular(line: string): ParsedStructured | null {
  const parts = line.split('\t');
  if (parts.length < 4) return null;

  const [ts, level, logger, ...rest] = parts;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(ts)) return null;
  if (!/^(trace|debug|info|warn(ing)?|error|fatal|panic|critical)$/i.test(level))
    return null;

  const messageAndJson = rest.join('\t');
  let message = messageAndJson;
  const fields: ParsedStructured['fields'] = {};

  // Detect trailing JSON object
  const lastBrace = messageAndJson.lastIndexOf('}');
  if (lastBrace !== -1) {
    let depth = 0;
    let jsonStart = -1;
    for (let i = lastBrace; i >= 0; i--) {
      if (messageAndJson[i] === '}') depth++;
      if (messageAndJson[i] === '{') depth--;
      if (depth === 0) {
        jsonStart = i;
        break;
      }
    }
    if (jsonStart > 0) {
      try {
        const obj = JSON.parse(messageAndJson.slice(jsonStart)) as unknown;
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const [k, v] of Object.entries(obj))
            fields[k] = flattenValue(v);
          message = messageAndJson.slice(0, jsonStart).trim();
        }
      } catch {
        /* not valid JSON */
      }
    }
  }

  fields.logger = logger;
  fields.msg = message;

  return { format: 'tabular', fields };
}

export function parseLogfmt(line: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  let i = 0;
  const L = line.length;
  while (i < L) {
    // Skip whitespace
    while (i < L && /\s/.test(line[i]!)) i++;
    if (i >= L) break;
    // Key: non-whitespace, non-`=` chars
    const keyStart = i;
    while (i < L && line[i] !== '=' && !/\s/.test(line[i]!)) i++;
    if (keyStart === i) {
      i++;
      continue;
    }
    const key = line.slice(keyStart, i);
    // Expect '='
    if (line[i] !== '=') {
      // Not a key=value token; skip.
      continue;
    }
    i++; // consume '='
    // Value: either quoted or bare
    let value = '';
    if (line[i] === '"') {
      i++;
      while (i < L && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < L) {
          value += line[i + 1]!;
          i += 2;
        } else {
          value += line[i]!;
          i++;
        }
      }
      if (line[i] === '"') i++;
    } else {
      const vStart = i;
      while (i < L && !/\s/.test(line[i]!)) i++;
      value = line.slice(vStart, i);
    }
    if (key) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}
