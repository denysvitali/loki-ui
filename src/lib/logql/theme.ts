import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const editorTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--color-foreground)',
      backgroundColor: 'var(--color-background)',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
    },
    '.cm-content': {
      caretColor: 'var(--color-foreground)',
      padding: '8px 12px',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--color-foreground)',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor:
        'color-mix(in oklab, var(--color-accent) 30%, transparent)',
    },
    '.cm-selectionBackground': {
      backgroundColor:
        'color-mix(in oklab, var(--color-foreground) 15%, transparent)',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--color-subtle-foreground)',
      border: 'none',
    },
    '.cm-panels': {
      backgroundColor: 'var(--color-card)',
      color: 'var(--color-foreground)',
    },
    '.cm-placeholder': {
      color: 'var(--color-subtle-foreground)',
    },
  },
  { dark: true },
);

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--color-level-warn)' },
  { tag: t.operator, color: 'var(--color-level-info)' },
  { tag: t.variableName, color: 'var(--color-foreground)' },
  { tag: t.propertyName, color: 'var(--color-accent)' },
  { tag: t.string, color: 'var(--color-level-info)' },
  { tag: t.number, color: 'var(--color-level-warn)' },
  { tag: t.bracket, color: 'var(--color-subtle-foreground)' },
  { tag: t.punctuation, color: 'var(--color-subtle-foreground)' },
  { tag: t.lineComment, color: 'var(--color-subtle-foreground)', fontStyle: 'italic' },
]);

export const logqlEditorExtensions = [
  editorTheme,
  syntaxHighlighting(highlightStyle),
];
