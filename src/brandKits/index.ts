// The brand kits people can pick from. Only maintainers add kits (for now):
// put a new kit in its own file next to this one and list it here.
import type { BrandKit } from '../lib/brandKit';
import { ontarioTech } from './ontarioTech';

export const BRAND_KITS: BrandKit[] = [ontarioTech];

export function brandKitById(id: string | undefined | null): BrandKit | null {
  return BRAND_KITS.find((k) => k.id === id) ?? null;
}
