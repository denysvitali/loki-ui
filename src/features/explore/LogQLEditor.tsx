import { useEffect, useRef } from 'react';
import { EditorState, Prec } from '@codemirror/state';
import {
  EditorView,
  keymap,
  placeholder as placeholderExt,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
} from '@codemirror/view';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import {
  defaultKeymap,
  history,
  historyKeymap,
} from '@codemirror/commands';
import { logql } from '@/lib/logql/codemirror';
import { logqlEditorExtensions } from '@/lib/logql/theme';

interface LogQLEditorProps {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  onHistoryOpen: () => void;
  onUpOnEmpty: () => void;
  placeholder?: string;
}

/**
 * CodeMirror 6 editor with LogQL syntax highlighting (via
 * @grafana/lezer-logql) and our canonical key map:
 *
 *   Ctrl/Cmd+Enter → onRun
 *   Ctrl/Cmd+H     → onHistoryOpen
 *   ↑ when empty   → onHistoryOpen (shell muscle memory)
 */
export function LogQLEditor({
  value,
  onChange,
  onRun,
  onHistoryOpen,
  onUpOnEmpty,
  placeholder = '',
}: LogQLEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const handlersRef = useRef({ onRun, onHistoryOpen, onUpOnEmpty });
  handlersRef.current = { onRun, onHistoryOpen, onUpOnEmpty };

  useEffect(() => {
    if (!hostRef.current) return;

    const appKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        preventDefault: true,
        run: () => {
          handlersRef.current.onRun();
          return true;
        },
      },
      {
        key: 'Mod-h',
        preventDefault: true,
        run: () => {
          handlersRef.current.onHistoryOpen();
          return true;
        },
      },
      {
        key: 'ArrowUp',
        run: (view) => {
          if (view.state.doc.toString().trim() === '') {
            handlersRef.current.onUpOnEmpty();
            return true;
          }
          return false;
        },
      },
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        indentOnInput(),
        logql(),
        ...logqlEditorExtensions,
        placeholderExt(placeholder),
        // App-level shortcuts run before default (so Mod-Enter doesn't
        // submit a newline).
        Prec.highest(appKeymap),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChange(u.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into the editor when they come from, e.g.,
  // clicking a label or picking from history.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      className="rounded-md border border-input bg-background focus-within:border-ring overflow-hidden"
      aria-label="LogQL query editor"
    />
  );
}
