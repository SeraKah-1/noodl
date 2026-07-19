/** Normalize human-entered short answers without accepting arbitrary substrings. */
export function normalizeShortAnswer(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Accept exact normalized answers. Authors may provide explicit alternatives
 * separated with `|` (for example: "H2O | water | air").
 */
export function isFillBlankCorrect(input: string, expected: string): boolean {
  const normalizedInput = normalizeShortAnswer(input);
  if (!normalizedInput) return false;

  return expected
    .split('|')
    .map(normalizeShortAnswer)
    .filter(Boolean)
    .some((answer) => answer === normalizedInput);
}
