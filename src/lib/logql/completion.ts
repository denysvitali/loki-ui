import type {
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete';
import type { LokiClient } from '@/lib/loki';

/**
 * LogQL autocomplete context detection. See PLAN §4.4.
 *
 * The lezer grammar is great for syntax highlighting but its tree can
 * be incomplete mid-edit (e.g. `{app=` is an unfinished matcher). We
 * therefore use a focused text-based probe around the cursor:
 *
 *   - Inside an open `{ ... }` with cursor after `{` or `,` → label name.
 *   - After `<label>=` / `=~` / `!=` / `!~` and before a closing quote → value.
 *   - Otherwise no completion.
 *
 * Edge cases:
 *   - We bail when there's a `|` operator between the last `{` and the
 *     cursor (we're past the selector into pipeline territory).
 *   - Labels can be quoted or bare identifiers; we handle both.
 */

export interface CompletionDeps {
  /** Current Loki client used to fetch labels / values. */
  client: LokiClient;
  /** Time range in nanoseconds (for `start`/`end` on labels endpoints). */
  fromNs: () => bigint;
  toNs: () => bigint;
  /** Current stream selector to pass to `/labels` / `/label/{n}/values`. */
  selector: () => string;
}

interface LabelNameContext {
  kind: 'label-name';
  /** Where the incomplete identifier starts. */
  from: number;
  /** Typed prefix so far. */
  typed: string;
}
interface LabelValueContext {
  kind: 'label-value';
  label: string;
  /** Where the incomplete value starts (just after the opening quote). */
  from: number;
  /** Typed prefix so far (unquoted). */
  typed: string;
}
type Context = LabelNameContext | LabelValueContext | null;

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/;

/**
 * Inspect the text before the cursor and decide what (if anything) to
 * complete. Exported for unit testing.
 */
export function detectContext(
  before: string,
  cursor: number,
): Context {
  // Find the last opening `{` before cursor without a matching close.
  let openIdx = -1;
  let depth = 0;
  for (let i = cursor - 1; i >= 0; i--) {
    const c = before[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) {
        openIdx = i;
        break;
      }
      depth--;
    }
  }
  if (openIdx < 0) return null;

  // Bail if there's any pipe operator between the open brace and the cursor —
  // cursor is past the selector.
  const slice = before.slice(openIdx, cursor);
  if (/\|/.test(slice) || /}/.test(slice.slice(1))) {
    // `}` past the opening brace means we've already closed; past the selector.
    return null;
  }

  // Walk from the last `,` or `{` (the start of the current matcher).
  const matcherStart = Math.max(
    slice.lastIndexOf('{'),
    slice.lastIndexOf(','),
  );
  const matcher = slice.slice(matcherStart + 1); // text after `{` or `,`

  // If matcher contains `=` / `=~` / `!=` / `!~`, we're in value territory.
  const opMatch = /(^|[^!<>=])(=~|!~|!=|=)/.exec(matcher);
  if (opMatch) {
    const opIdx = opMatch.index + opMatch[1].length;
    const labelPart = matcher.slice(0, opIdx).trim();
    const labelName = extractLabelName(labelPart);
    if (!labelName) return null;

    const afterOp = matcher.slice(opIdx + opMatch[2].length);
    // Must be inside an opening double quote with no closing quote yet.
    const q = afterOp.indexOf('"');
    if (q < 0) return null;
    const rest = afterOp.slice(q + 1);
    // If rest contains an unescaped closing quote, the value is already
    // closed — no completion.
    if (/(^|[^\\])"/.test(rest)) return null;

    const typed = rest;
    const from = cursor - typed.length;
    return { kind: 'label-value', label: labelName, from, typed };
  }

  // Otherwise, we're typing a label name.
  const trimmed = matcher.replace(/^\s+/, '');
  const leadingWs = matcher.length - trimmed.length;
  if (trimmed.length === 0) {
    // Cursor immediately after `{` or `,` — offer all labels.
    return { kind: 'label-name', from: cursor, typed: '' };
  }
  const identMatch = IDENT.exec(trimmed);
  if (!identMatch || identMatch.index !== 0) return null;
  const typed = identMatch[0];
  // Only suggest if cursor is at the end of the ident (not past it).
  if (leadingWs + typed.length !== matcher.length) return null;
  const from = cursor - typed.length;
  return { kind: 'label-name', from, typed };
}

function extractLabelName(part: string): string | null {
  const m = IDENT.exec(part);
  return m && m.index === 0 && m[0].length === part.length ? m[0] : null;
}

// -----

export function buildCompletionSource(deps: CompletionDeps): CompletionSource {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const doc = ctx.state.doc.toString();
    const cursor = ctx.pos;
    const before = doc.slice(0, cursor);
    const context = detectContext(before, cursor);
    if (!context) return null;

    const { client } = deps;
    const fromNs = deps.fromNs();
    const toNs = deps.toNs();
    const selector = deps.selector();

    try {
      if (context.kind === 'label-name') {
        const labels = await client.labels(
          {
            start: fromNs,
            end: toNs,
            ...(selector ? { query: selector } : {}),
          },
          ctx.aborted ? new AbortController().signal : undefined,
        );
        if (labels.length === 0) return null;
        return {
          from: context.from,
          options: labels.map((l) => ({ label: l, type: 'property' })),
          validFor: IDENT,
        };
      } else {
        const values = await client.labelValues(
          context.label,
          {
            start: fromNs,
            end: toNs,
            ...(selector ? { query: selector } : {}),
          },
          ctx.aborted ? new AbortController().signal : undefined,
        );
        if (values.length === 0) return null;
        return {
          from: context.from,
          options: values.slice(0, 500).map((v) => ({
            label: v,
            type: 'text',
          })),
          // Valid while typing any non-quote characters — cursor-aware.
          validFor: /^[^"]*$/,
        };
      }
    } catch {
      return null;
    }
  };
}
