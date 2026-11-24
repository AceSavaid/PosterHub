// Small corrections made while typing, like Google Docs and Word:
// "- " or "1. " at the start of a line starts a list, straight quotes curl,
// and a hyphen between two numbers becomes an en dash (10–20).
// Each correction is one step on the browser's own undo, so Ctrl/⌘ Z puts back what was typed.

/** The quote to put in for a straight one, judging by the character before it. */
export function curlQuote(before: string, q: '"' | "'"): string {
  const opening = before === '' || /[\s([{—–-]/.test(before);
  if (q === '"') return opening ? '“' : '”';
  return opening ? '‘' : '’';
}

/** A list to start when a space is typed after `line` (the text before the caret on this line). */
export function listFor(line: string): 'ul' | 'ol' | null {
  if (/^\s*[-*•]$/.test(line)) return 'ul';
  if (/^\s*1[.)]$/.test(line)) return 'ol';
  return null;
}

/** Whether typing digit `typed` after `before` should turn the hyphen before it into an en dash ("10-2" → "10–2"). */
export function dashBefore(before: string, typed: string): boolean {
  return /\d$/.test(typed) && /\d-$/.test(before) && !/[\d.]-\d+-$/.test(before);
}
