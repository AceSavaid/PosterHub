import type { ColorValue, Palette } from '../types';
import { PALETTE_ROLES, resolveColor } from '../model';

interface Props {
  value: ColorValue | undefined;
  palette: Palette;
  onChange: (c: ColorValue | undefined) => void;
  allowNone?: boolean;
}

/**
 * Pick a palette role (stays linked if the palette changes) or any custom colour.
 */
export function ColorInput({ value, palette, onChange, allowNone }: Props) {
  const resolved = resolveColor(value, palette);
  return (
    <div className="color-input">
      <div className="role-swatches" role="group" aria-label="Colour">
        {allowNone && (
          <button type="button" className={'swatch none' + (!value || value === 'transparent' ? ' active' : '')} title="None" aria-label="No colour" aria-pressed={!value || value === 'transparent'} onClick={() => onChange(undefined)} />
        )}
        {PALETTE_ROLES.map((r) => (
          <button
            type="button"
            key={r}
            className={'swatch' + (value === '@' + r ? ' active' : '')}
            style={{ background: palette[r] }}
            title={`${r[0].toUpperCase() + r.slice(1)} (follows palette)`}
            aria-label={`${r[0].toUpperCase() + r.slice(1)} (follows palette)`}
            aria-pressed={value === '@' + r}
            onClick={() => onChange('@' + r)}
          />
        ))}
        <label className={'swatch custom' + (value && !value.startsWith('@') && value !== 'transparent' ? ' active' : '')} title="Custom colour">
          <input type="color" aria-label="Custom colour" value={/^#[0-9a-f]{6}$/i.test(resolved) ? resolved : '#000000'} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </div>
  );
}
