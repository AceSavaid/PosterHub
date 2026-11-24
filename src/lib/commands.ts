// "Search the menus" (Alt+/): every command in the editor as one flat list, found by typing.
// Pure so the ranking can be unit tested; the editor builds the list each time it opens.

export interface Command {
  id: string;
  /** what the row says, e.g. "Make the poster landscape (wide)" */
  label: string;
  /** where the command also lives, shown on the right, e.g. "Insert" or "Export" */
  group: string;
  /** other words people might type for it ("wide", "horizontal") */
  keywords?: string;
  /** shortcut written with "Ctrl/⌘", shown through keys() */
  shortcut?: string;
  /** shown greyed out (e.g. Redo with nothing to redo) */
  disabled?: boolean;
  run: () => void;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Commands matching what was typed, best first. Every typed word has to appear at the start
 * of a word in the label, group or keywords ("qr" finds "Add a QR code", "land" finds
 * "landscape"). Labels that start with the words, then labels that contain them, rank above
 * keyword-only matches. Greyed-out commands go last. An empty search lists everything.
 */
export function searchCommands(query: string, commands: Command[], limit = 12): Command[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return commands.slice(0, limit);
  const scored: { c: Command; score: number; i: number }[] = [];
  commands.forEach((c, i) => {
    const label = ' ' + norm(c.label);
    const all = label + ' ' + norm(c.group) + ' ' + norm(c.keywords ?? '');
    if (!words.every((w) => all.includes(' ' + w))) return;
    let score = 0;
    const q = words.join(' ');
    if (label.startsWith(' ' + q)) score += 100;
    else if (label.includes(' ' + q)) score += 60;
    score += words.filter((w) => label.includes(' ' + w)).length * 10;
    if (c.disabled) score -= 1000;
    scored.push({ c, score, i });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((s) => s.c);
}
