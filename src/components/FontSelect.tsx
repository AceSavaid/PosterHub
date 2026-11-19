import type { Poster } from '../types';
import { POPULAR_GOOGLE_FONTS, SYSTEM_FONTS } from '../model';
import { loadGoogleFont } from '../lib/fonts';

interface Props {
  poster: Poster;
  value: string;
  onChange: (family: string) => void;
  allowTheme?: boolean;
}

/** Font dropdown: theme fonts, the poster's custom/added fonts, popular Google fonts, system fonts. */
export function FontSelect({ poster, value, onChange, allowTheme }: Props) {
  const custom = poster.customFonts.map((f) => f.family);
  const added = poster.googleFonts.filter((f) => !POPULAR_GOOGLE_FONTS.includes(f));
  const known = new Set([...custom, ...added, ...POPULAR_GOOGLE_FONTS, ...SYSTEM_FONTS, '@heading', '@body']);
  return (
    <select
      value={value}
      onChange={(e) => {
        const f = e.target.value;
        if (!f.startsWith('@') && !custom.includes(f)) loadGoogleFont(f);
        onChange(f);
      }}
    >
      {allowTheme && (
        <optgroup label="Poster fonts">
          <option value="@heading">Heading font ({poster.headingFont})</option>
          <option value="@body">Body font ({poster.bodyFont})</option>
        </optgroup>
      )}
      {!known.has(value) && <option value={value}>{value}</option>}
      {custom.length > 0 && (
        <optgroup label="Your fonts">
          {custom.map((f) => <option key={f}>{f}</option>)}
        </optgroup>
      )}
      {added.length > 0 && (
        <optgroup label="Added Google fonts">
          {added.map((f) => <option key={f}>{f}</option>)}
        </optgroup>
      )}
      <optgroup label="Google Fonts">
        {POPULAR_GOOGLE_FONTS.map((f) => <option key={f}>{f}</option>)}
      </optgroup>
      <optgroup label="System fonts">
        {SYSTEM_FONTS.map((f) => <option key={f}>{f}</option>)}
      </optgroup>
    </select>
  );
}
