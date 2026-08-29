/**
 * The line-based editors the Community sheets are built from.
 *
 * Ported from console-community.js:106-122. Several fields in this module are
 * ARRAYS the operator edits as free text — one paragraph per line, one agenda
 * stop per line as "time | detail". A repeater UI with add/remove buttons was the
 * obvious alternative and the demo rejected it: writing six agenda stops is one
 * paste from a document, and six rows of chrome makes that six operations.
 *
 * The parse is deliberately forgiving. A line with no pipe becomes a pair with an
 * empty second half rather than being dropped, because losing a line somebody
 * typed is worse than keeping a half-filled one they can see and fix.
 */

/** Split on newlines, trim, drop the blanks. */
export function linesToArr(text: string): string[] {
  return String(text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function arrToLines(arr: readonly string[] | null | undefined): string {
  return (arr ?? []).join('\n');
}

/**
 * `"5:30 AM | Assemble at the pickup point"` -> `{ t: '5:30 AM', v: 'Assemble…' }`.
 *
 * Splits on the FIRST pipe only, so a detail containing a pipe survives intact.
 */
export function parsePairLines<K1 extends string, K2 extends string>(
  text: string,
  k1: K1,
  k2: K2,
): Array<Record<K1 | K2, string>> {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('|');
      return {
        [k1]: (i === -1 ? l : l.slice(0, i)).trim(),
        [k2]: (i === -1 ? '' : l.slice(i + 1)).trim(),
      } as Record<K1 | K2, string>;
    });
}

export function pairLinesToText<K1 extends string, K2 extends string>(
  arr: ReadonlyArray<Record<string, string>> | null | undefined,
  k1: K1,
  k2: K2,
): string {
  return (arr ?? []).map((o) => `${o[k1] ?? ''} | ${o[k2] ?? ''}`).join('\n');
}
