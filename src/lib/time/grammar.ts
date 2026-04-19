/**
 * Time-range grammar (Grafana subset). See PLAN §4.5.
 *
 * Supported:
 *   - `now`
 *   - `now-<n><u>` / `now+<n><u>`  (offset)
 *   - `now/<u>`                    (snap to start of unit, in user TZ)
 *   - Chained: `now/d-1h`, `now-1d/d`
 *   - Absolute: ISO-8601, `YYYY-MM-DD HH:mm:ss` (user TZ), bare ns epoch
 *
 * Units (case-sensitive):
 *   s m h d w M y
 *   (uppercase M = months, lowercase m = minutes)
 */

export type TimeUnit = 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y';

export interface RelativeTime {
  kind: 'relative';
  raw: string;
}
export interface AbsoluteTime {
  kind: 'absolute';
  raw: string;
}
export type ParsedTime = RelativeTime | AbsoluteTime;

const UNIT_SECONDS: Record<Exclude<TimeUnit, 'M' | 'y'>, number> = {
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
  w: 604_800,
};

const NS_REGEX = /^\d{16,}$/;
const ISO_REGEX =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Parse a time expression into the typed form. Throws on invalid input. */
export function parseTime(input: string): ParsedTime {
  const s = input.trim();
  if (!s) throw new Error('empty time expression');
  if (s === 'now' || /^now[-+/]/.test(s)) {
    // Validate the full relative grammar by running a dry resolve — throws
    // on unknown units or malformed tails. Cost is negligible.
    resolveToNs({ kind: 'relative', raw: s }, new Date(0), 'UTC');
    return { kind: 'relative', raw: s };
  }
  if (NS_REGEX.test(s) || ISO_REGEX.test(s)) return { kind: 'absolute', raw: s };
  throw new Error(`unrecognized time expression: ${input}`);
}

/**
 * Resolve a parsed time to a nanosecond epoch (bigint) at the given
 * reference instant. `timeZone` controls snap alignment (per PLAN §4.5).
 */
export function resolveToNs(
  t: ParsedTime,
  now: Date = new Date(),
  timeZone: string = browserTimeZone(),
): bigint {
  if (t.kind === 'absolute') return absoluteToNs(t.raw, timeZone);
  return relativeToNs(t.raw, now, timeZone);
}

function absoluteToNs(raw: string, timeZone: string): bigint {
  if (NS_REGEX.test(raw)) return BigInt(raw);
  // ISO with timezone → Date.parse honours it. Naïve (no Z/offset) →
  // interpret in the user's timezone.
  const hasTzOrZ = /Z|[+-]\d{2}:?\d{2}$/.test(raw);
  const normalized = raw.replace(' ', 'T');
  if (hasTzOrZ) {
    const ms = Date.parse(normalized);
    if (Number.isNaN(ms)) throw new Error(`invalid absolute time: ${raw}`);
    return BigInt(ms) * 1_000_000n;
  }
  // Interpret naïve wall-clock in the user's tz.
  const wallMs = Date.parse(normalized + 'Z'); // parse as UTC first
  if (Number.isNaN(wallMs)) throw new Error(`invalid absolute time: ${raw}`);
  const offsetMs = timezoneOffsetMs(new Date(wallMs), timeZone);
  return BigInt(wallMs - offsetMs) * 1_000_000n;
}

function relativeToNs(raw: string, now: Date, timeZone: string): bigint {
  // Consume `now`, then repeatedly consume operators: -<n><u>, +<n><u>, /<u>
  let rest = raw;
  if (!rest.startsWith('now')) throw new Error(`relative must start with now: ${raw}`);
  rest = rest.slice(3);

  let date = new Date(now.getTime());

  const opRe = /^([-+/])/;
  const offRe = /^(\d+)([smhdwMy])/;
  const snapRe = /^([smhdwMy])/;

  while (rest.length > 0) {
    const op = opRe.exec(rest);
    if (!op) throw new Error(`unexpected in time expression: ${rest}`);
    rest = rest.slice(1);
    if (op[1] === '/') {
      const snap = snapRe.exec(rest);
      if (!snap) throw new Error(`expected unit after /: ${rest}`);
      rest = rest.slice(1);
      date = snapToUnit(date, snap[1] as TimeUnit, timeZone);
    } else {
      const off = offRe.exec(rest);
      if (!off) throw new Error(`expected <n><unit> after ${op[1]}: ${rest}`);
      rest = rest.slice(off[0].length);
      const n = Number(off[1]);
      const unit = off[2] as TimeUnit;
      const sign = op[1] === '-' ? -1 : 1;
      date = applyOffset(date, sign * n, unit);
    }
  }

  return BigInt(date.getTime()) * 1_000_000n;
}

function applyOffset(date: Date, n: number, unit: TimeUnit): Date {
  const d = new Date(date.getTime());
  switch (unit) {
    case 's':
    case 'm':
    case 'h':
    case 'd':
    case 'w':
      d.setTime(d.getTime() + n * UNIT_SECONDS[unit] * 1000);
      return d;
    case 'M':
      d.setUTCMonth(d.getUTCMonth() + n);
      return d;
    case 'y':
      d.setUTCFullYear(d.getUTCFullYear() + n);
      return d;
  }
}

/**
 * Snap to the start of a unit in the given timezone. e.g. `now/d`
 * at 14:32 local returns today 00:00 local.
 */
function snapToUnit(date: Date, unit: TimeUnit, timeZone: string): Date {
  // Get wall-clock parts in the target TZ.
  const parts = wallClockPartsInTz(date, timeZone);
  switch (unit) {
    case 's':
      parts.ms = 0;
      break;
    case 'm':
      parts.ms = 0;
      parts.second = 0;
      break;
    case 'h':
      parts.ms = 0;
      parts.second = 0;
      parts.minute = 0;
      break;
    case 'd':
      parts.ms = 0;
      parts.second = 0;
      parts.minute = 0;
      parts.hour = 0;
      break;
    case 'w': {
      // ISO week starts on Monday. Roll back to Monday 00:00.
      parts.ms = 0;
      parts.second = 0;
      parts.minute = 0;
      parts.hour = 0;
      const dayFromMonday = (parts.weekday + 6) % 7; // 0 = Monday
      parts.day -= dayFromMonday;
      break;
    }
    case 'M':
      parts.ms = 0;
      parts.second = 0;
      parts.minute = 0;
      parts.hour = 0;
      parts.day = 1;
      break;
    case 'y':
      parts.ms = 0;
      parts.second = 0;
      parts.minute = 0;
      parts.hour = 0;
      parts.day = 1;
      parts.month = 1;
      break;
  }
  return wallClockToDate(parts, timeZone);
}

interface WallClockParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31 (may be adjusted)
  hour: number;
  minute: number;
  second: number;
  ms: number;
  weekday: number; // 0 = Sunday, 1 = Monday, ...
}

function wallClockPartsInTz(date: Date, timeZone: string): WallClockParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    // Intl returns '24' for midnight in hour12: false — normalize.
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    ms: date.getMilliseconds(),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

function wallClockToDate(parts: WallClockParts, timeZone: string): Date {
  // Build a UTC instant from the wall-clock fields, then subtract the TZ
  // offset at that wall time to get the corresponding real Date.
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.ms,
  );
  const offsetMs = timezoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMs);
}

function timezoneOffsetMs(date: Date, timeZone: string): number {
  // Offset (in ms) to add to UTC to get wall-clock in `timeZone`.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const f = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    f('year'),
    f('month') - 1,
    f('day'),
    f('hour'),
    f('minute'),
    f('second'),
  );
  return asUtc - date.getTime();
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ----- convenience --------------------------------------------------------

export function resolveRange(
  from: string,
  to: string,
  now: Date = new Date(),
  timeZone: string = browserTimeZone(),
): { fromNs: bigint; toNs: bigint } {
  const f = resolveToNs(parseTime(from), now, timeZone);
  const t = resolveToNs(parseTime(to), now, timeZone);
  if (f > t) throw new Error('"from" must be <= "to"');
  return { fromNs: f, toNs: t };
}

/** Convert a ns epoch (bigint) to a Date (ms precision — loses sub-ms). */
export function nsToDate(ns: bigint): Date {
  return new Date(Number(ns / 1_000_000n));
}
