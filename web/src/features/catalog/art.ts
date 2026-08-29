/**
 * The picture an item wears when it has none of its own.
 *
 * Ported from core.js `taskKey` / `taskArtSrc` (2461-2481).
 *
 * AN ITEM NOBODY HAS PHOTOGRAPHED YET READS AS ITSELF, not as a broken tile.
 * Each pillar ships a small family of subjects — fitness by training quality,
 * culture by meal block, yoga and wellness by practice — and an unrecognised
 * label falls back to the family's first subject rather than to nothing. The
 * demo's own comment: "the family art stands in rather than showing a broken
 * image".
 *
 * MOTIVATION IS EXCLUDED on purpose. A film owns no specimen, and lending it
 * another film's face would be a lie the "Not filmed" pill beside it is already
 * contradicting.
 */
export function taskKey(pillar: string, label: string): string {
  const s = label.toLowerCase();
  if (pillar === 'culture') {
    return /break/.test(s)
      ? 'breakfast'
      : /lunch/.test(s)
        ? 'lunch'
        : /dinner/.test(s)
          ? 'dinner'
          : /pre-?workout/.test(s)
            ? 'prework'
            : /snack/.test(s)
              ? 'snack'
              : 'drink';
  }
  if (pillar === 'fitness') {
    return /muscle/.test(s)
      ? 'muscle'
      : /endur/.test(s)
        ? 'endurance'
        : /cardio/.test(s)
          ? 'cardio'
          : 'strength';
  }
  if (pillar === 'yoga') {
    return /flex/.test(s) ? 'flexibility' : /breath/.test(s) ? 'breath' : 'mobility';
  }
  return /nidra/.test(s) ? 'nidra' : /downshift/.test(s) ? 'downshift' : 'breath';
}

/** The authored image if there is one, else the family art. Null for a film. */
export function itemArt(pillar: string, name: string, authored: string | null | undefined): string | null {
  if (authored) return `/${authored}`;
  if (pillar === 'motivation') return null;
  return `/img/tasks/${pillar}-${taskKey(pillar, name)}.webp`;
}
