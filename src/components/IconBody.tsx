import type { Poster, PosterElement } from '../types';
import { iconArt, iconColors, pathPaint, type IconArt, type IconColors } from '../lib/icons/library';
import { useIconsReady } from '../lib/useIcons';

/** The artwork as inline SVG paths (no HTML from files is ever inserted). */
export function IconSvg({ art, colors, className }: { art: IconArt; colors: IconColors; className?: string }) {
  return (
    <svg className={className} viewBox={art.viewBox.join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      {art.paths.map((p, i) => {
        const paint = pathPaint(p, colors);
        return <path key={i} d={p.d} fill={paint.fill} fillOpacity={paint.opacity < 1 ? paint.opacity : undefined} fillRule={p.evenOdd ? 'evenodd' : undefined} />;
      })}
    </svg>
  );
}

/** An icon on the poster, scaled to fit its box and centred, as in the PDF export. */
export function IconBody({ el, poster }: { el: PosterElement; poster: Poster }) {
  const ready = useIconsReady();
  const spec = el.icon;
  if (!spec) return null;
  if (!ready) return <div className="el-icon-msg ui-only">Loading icon…</div>;
  const art = iconArt(spec.id);
  if (!art) return <div className="el-icon-msg ui-only">Icon not found</div>;
  return <IconSvg className="el-icon-art" art={art} colors={iconColors(spec, poster.palette)} />;
}
