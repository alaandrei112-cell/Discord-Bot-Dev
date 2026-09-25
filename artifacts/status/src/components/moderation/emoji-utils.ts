export function applyEmojiSelection(
  value: string,
  emoji: string,
  start: number,
  end: number,
  replacement = false,
): { value: string; caret: number } {
  if (replacement) return { value: emoji, caret: emoji.length };
  const next = value.slice(0, start) + emoji + value.slice(end);
  return { value: next, caret: start + emoji.length };
}