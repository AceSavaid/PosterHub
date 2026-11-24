// Characters scientists type that aren't on the keyboard, with names to search by
// (like Insert → Special characters in Google Docs).

export interface SpecialChar {
  ch: string;
  name: string;
  group: string;
}

const G = (group: string, list: [string, string][]): SpecialChar[] => list.map(([ch, name]) => ({ ch, name, group }));

export const SPECIAL_CHARS: SpecialChar[] = [
  ...G('Greek', [
    ['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['δ', 'delta'], ['ε', 'epsilon'], ['ζ', 'zeta'], ['η', 'eta'], ['θ', 'theta'],
    ['κ', 'kappa'], ['λ', 'lambda'], ['μ', 'mu'], ['ν', 'nu'], ['ξ', 'xi'], ['π', 'pi'], ['ρ', 'rho'], ['σ', 'sigma'],
    ['τ', 'tau'], ['φ', 'phi'], ['χ', 'chi'], ['ψ', 'psi'], ['ω', 'omega'],
    ['Γ', 'capital gamma'], ['Δ', 'capital delta'], ['Θ', 'capital theta'], ['Λ', 'capital lambda'], ['Π', 'capital pi'],
    ['Σ', 'capital sigma'], ['Φ', 'capital phi'], ['Ψ', 'capital psi'], ['Ω', 'capital omega ohm'],
  ]),
  ...G('Maths', [
    ['±', 'plus minus'], ['×', 'times multiply'], ['÷', 'divide'], ['−', 'minus'], ['≈', 'approximately'], ['≠', 'not equal'],
    ['≤', 'less than or equal'], ['≥', 'greater than or equal'], ['≪', 'much less than'], ['≫', 'much greater than'],
    ['∞', 'infinity'], ['√', 'square root'], ['∑', 'sum'], ['∫', 'integral'], ['∂', 'partial'], ['∝', 'proportional to'],
    ['∆', 'increment change'], ['∈', 'element of'], ['∩', 'intersection'], ['∪', 'union'], ['·', 'middle dot'], ['′', 'prime'],
  ]),
  ...G('Units', [
    ['°', 'degree'], ['℃', 'degrees celsius'], ['µ', 'micro'], ['Å', 'angstrom'], ['‰', 'per mille'],
  ]),
  ...G('Superscript and subscript', [
    ['⁰', 'superscript zero'], ['¹', 'superscript one'], ['²', 'superscript two squared'], ['³', 'superscript three cubed'],
    ['⁴', 'superscript four'], ['⁻', 'superscript minus'], ['⁺', 'superscript plus'],
    ['₀', 'subscript zero'], ['₁', 'subscript one'], ['₂', 'subscript two'], ['₃', 'subscript three'], ['₄', 'subscript four'],
  ]),
  ...G('Arrows', [
    ['→', 'right arrow'], ['←', 'left arrow'], ['↑', 'up arrow increase'], ['↓', 'down arrow decrease'], ['↔', 'left right arrow'],
    ['⇒', 'implies'], ['⇌', 'equilibrium'],
  ]),
  ...G('Punctuation', [
    ['–', 'en dash range'], ['—', 'em dash'], ['…', 'ellipsis'], ['•', 'bullet'], ['†', 'dagger'], ['‡', 'double dagger'],
    ['§', 'section'], ['¶', 'paragraph'], ['©', 'copyright'], ['®', 'registered'], ['™', 'trademark'], ['✓', 'check mark tick'],
  ]),
];

/** Characters whose name (or the character itself) matches every word typed. */
export function searchChars(query: string): SpecialChar[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return SPECIAL_CHARS;
  return SPECIAL_CHARS.filter((c) => words.every((w) => c.ch === w || c.name.includes(w) || c.group.toLowerCase().includes(w)));
}

const RECENT_KEY = 'posterhub.recentChars';

export function recentChars(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((c) => typeof c === 'string' && SPECIAL_CHARS.some((s) => s.ch === c)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberChar(ch: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([ch, ...recentChars().filter((c) => c !== ch)].slice(0, 8)));
  } catch {
    /* private window: recent list just isn't kept */
  }
}
