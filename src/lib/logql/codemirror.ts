import { LRLanguage, LanguageSupport } from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';
import { parser as logqlParser } from '@grafana/lezer-logql';

/**
 * CodeMirror LanguageSupport for LogQL, backed by Grafana's lezer grammar.
 * We attach style tags so our highlight style (`logqlHighlight`) maps token
 * kinds to Tailwind-friendly colour variables.
 */
const logqlParserWithStyles = logqlParser.configure({
  props: [
    styleTags({
      Identifier: t.variableName,
      LabelName: t.propertyName,
      String: t.string,
      Number: t.number,
      Bytes: t.number,
      Duration: t.number,
      LineComment: t.lineComment,
      'Eq Neq Re Nre Gtr Gte Lss Lte Eql': t.operator,
      'PipeExact PipeMatch PipePattern Pipe': t.operator,
      'And Or Unless Bool On Ignoring GroupLeft GroupRight By Without':
        t.keyword,
      'Sum Avg Count Max Min Stddev Stdvar Bottomk Topk Sort Sort_Desc':
        t.keyword,
      'Json Logfmt Unpack Pattern Regexp Unwrap LabelFormat LineFormat LabelReplace Decolorize Drop Keep':
        t.keyword,
      'CountOverTime Rate RateCounter BytesOverTime BytesRate AvgOverTime SumOverTime MinOverTime MaxOverTime StddevOverTime StdvarOverTime QuantileOverTime FirstOverTime LastOverTime AbsentOverTime':
        t.keyword,
      '{ } [ ] ( )': t.bracket,
      ',': t.punctuation,
    }),
  ],
});

const logqlLanguage = LRLanguage.define({
  parser: logqlParserWithStyles,
  languageData: {
    commentTokens: { line: '#' },
    closeBrackets: { brackets: ['(', '[', '{', '"', '`'] },
  },
});

export function logql(): LanguageSupport {
  return new LanguageSupport(logqlLanguage);
}
