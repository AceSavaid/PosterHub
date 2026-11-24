import { useEffect, useLayoutEffect, useRef } from 'react';
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
  const chartRef = useRef<Chart | undefined>(undefined);
  const w = Math.round(widthPx);
  const h = Math.round(heightPx);
  const size = useRef({ w, h });
  size.current = { w, h };
  // Callers such as the chart dialog's preview build a new spec on every render, so compare by value.
  const key = JSON.stringify([spec, palette, font, textColor]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    if (id) chartCanvases.set(id, canvas);
    let alive = true;
    loadChartJs().then((ChartJs) => {
      if (!alive) return;
      const chart = new ChartJs(canvas, buildChartConfig(spec, palette, fontStack(font), textColor));
      chartRef.current = chart;
      // The box may have been resized while Chart.js was loading.
      chart.resize(size.current.w, size.current.h);
      // Re-render once web fonts arrive so labels use the right typeface.
      document.fonts.ready.then(() => alive && chart.update());
    });
    return () => {
      alive = false;
      chartRef.current?.destroy();
      chartRef.current = undefined;
      if (id && chartCanvases.get(id) === canvas) chartCanvases.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  // Resizing the box redraws the same chart at the new size instead of building a new one,
  // before the browser paints, so the chart doesn't flash blank while being dragged.
  useLayoutEffect(() => {
    chartRef.current?.resize(w, h);
  }, [w, h]);

  return <canvas ref={canvasRef} width={w} height={h} style={{ width: widthPx, height: heightPx, display: 'block' }} />;
}
