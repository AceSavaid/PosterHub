// Keyboard shortcut labels that match the computer: "⌘⇧Z" on a Mac, "Ctrl+Shift+Z"
// elsewhere. Text in the app is written with "Ctrl/⌘" and passed through `keys()`.

export function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return /mac|iphone|ipad|ipod/i.test(uaPlatform || navigator.platform || navigator.userAgent || '');
}

let mac: boolean | undefined;
/** Whether shortcut labels use Mac symbols. Tests can force it with `setMacForTests`. */
export function isMac() {
  return (mac ??= detectMac());
}
export function setMacForTests(v: boolean | undefined) {
  mac = v;
}

const MOD = String.raw`Ctrl\/⌘|⌘\/Ctrl|Cmd\/Ctrl|Ctrl\/Cmd`;
const MODIFIER = String.raw`(?:${MOD}|Ctrl|Shift|⇧|Alt|Option|⌥)`;
// A key after the modifiers: a capital letter or digit word (Z, F10), a named key or a symbol.
const KEY = String.raw`(?:[A-Z0-9][A-Za-z0-9]*|Enter|Delete|Backspace|Esc|Tab|Space|Arrows|\\|\[|\]|=|\+|-|<|>|\/|\?|,|\.)`;
const COMBO = new RegExp(String.raw`(?<![\w/])((?:${MODIFIER}\s+)+)(${KEY})(?![A-Za-z0-9])`, 'g');

function modifierLabel(m: string, onMac: boolean) {
  if (new RegExp(`^(?:${MOD})$`).test(m)) return onMac ? '⌘' : 'Ctrl';
  if (m === 'Shift' || m === '⇧') return onMac ? '⇧' : 'Shift';
  if (m === 'Alt' || m === 'Option' || m === '⌥') return onMac ? '⌥' : 'Alt';
  return onMac ? '⌃' : 'Ctrl'; // a plain Ctrl means the Control key on a Mac too
}

/**
 * Rewrites the shortcuts in a piece of text for this computer.
 * "Ctrl/⌘ Shift Z" → "⌘⇧Z" (Mac) or "Ctrl+Shift+Z"; "Ctrl/⌘-click" → "⌘-click" or "Ctrl-click".
 */
export function keys(text: string, onMac = isMac()): string {
  const out = text.replace(COMBO, (_all, mods: string, key: string) => {
    const parts = mods.trim().split(/\s+/).map((m) => modifierLabel(m, onMac));
    return onMac ? parts.join('') + key : [...parts, key].join('+');
  });
  // leftovers such as "Ctrl/⌘-click" and "Alt-drag"
  const named = out.replace(new RegExp(MOD, 'g'), onMac ? '⌘' : 'Ctrl');
  return onMac ? named.replace(/(?<![\w])Alt-(?=\w)/g, '⌥-') : named;
}

/** The name of the main modifier key, for sentences: "⌘" or "Ctrl". */
export const modKey = (onMac = isMac()) => (onMac ? '⌘' : 'Ctrl');
