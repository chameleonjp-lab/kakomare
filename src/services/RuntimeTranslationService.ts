type Catalog = Record<string, Record<string, string>>;
interface Pattern { key: string; expression: RegExp; parameters: string[]; specificity: number }
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Translate only trusted game-generated display text, never player names,
 * identity values, persisted records, audio dispatch, or simulation inputs. */
export function createRuntimeTranslator(catalog: Catalog): (source: string, language: string) => string {
  const exact = new Map<string, string[]>();
  const patterns: Pattern[] = [];
  for (const [key, source] of Object.entries(catalog.ja ?? {})) {
    const parameters = [...source.matchAll(/\{(p\d+)\}/g)];
    if (!parameters.length) { exact.set(source, [...(exact.get(source) ?? []), key]); continue; }
    const literalLength = source.replace(/\{p\d+\}/g, '').length;
    if (!literalLength) continue; // A catch-all would reinterpret arbitrary text.
    let expression = '^', last = 0;
    for (const match of parameters) {
      expression += escape(source.slice(last, match.index)) + '(.+?)';
      last = match.index! + match[0].length;
    }
    expression += escape(source.slice(last)) + '$';
    patterns.push({ key, expression: new RegExp(expression, 'u'), parameters: parameters.map(match => match[1]!), specificity: literalLength });
  }
  patterns.sort((a, b) => b.specificity - a.specificity);
  function translate(source: string, language: string, depth = 0): string {
    if (language === 'ja' || depth > 8) return source;
    const target = catalog[language];
    if (!target) return source;
    const keys = exact.get(source);
    if (keys) {
      const candidates = keys.map(key => target[key]);
      // Ambiguous source text needs an explicit stable key at its call site.
      if (candidates[0] !== undefined && candidates.every(text => text === candidates[0])) return candidates[0];
      return source;
    }
    for (const pattern of patterns) {
      const message = target[pattern.key];
      if (message === undefined) continue;
      const match = pattern.expression.exec(source);
      if (!match) continue;
      const values = Object.fromEntries(pattern.parameters.map((name, i) => [name, translate(match[i + 1]!, language, depth + 1)]));
      return message.replace(/\{(p\d+)\}/g, (token, name: string) => values[name] ?? token);
    }
    return source;
  }
  return (source, language) => translate(source, language);
}
