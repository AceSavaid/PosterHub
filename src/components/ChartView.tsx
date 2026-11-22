import { useEffect, useRef } from 'react';
import type { Chart } from 'chart.js';
import type { ChartSpec, Palette } from '../types';
import { buildChartConfig } from '../lib/chart';
import { fontStack } from '../model';
import { loadChartJs } from '../lib/chartjs';

/** Live chart canvases by element id, used for image fallbacks when exporting. */
export const chartCanvases = new Map<string, HTMLCanvasElement>();

interface Props {
  id?: string;
  spec: ChartSpec;
  palette: Palette;
  font: string;
  textColor: string;
  widthPx: number;
  heightPx: number;
}

export default function ChartView({ id, spec, palette, font, textColor, widthPx, heightPx }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Posters are cloned on every edit, so compare by value to avoid rebuilding charts needlessly.
  const key = JSON.stringify([spec, palette, font, textColor, Math.round(widthPx), Math.round(heightPx)]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    if (id) chartCanvases.set(id, canvas);
    let alive = true;
    let chart: Chart | undefined;
    loadChartJs().then((ChartJs) => {
      if (!alive) return;
      chart = new ChartJs(canvas, buildChartConfig(spec, palette, fontStack(font), textColor));
      // Re-render once web fonts arrive so labels use the right typeface.
      document.fonts.ready.then(() => alive && chart?.update());
    });
    return () => {
      alive = false;
      chart?.destroy();
      if (id && chartCanvases.get(id) === canvas) chartCanvases.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  return <canvas ref={canvasRef} width={Math.round(widthPx)} height={Math.round(heightPx)} style={{ width: widthPx, height: heightPx, display: 'block' }} />;
}
