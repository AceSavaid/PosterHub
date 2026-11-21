// Chart.js is large, so it loads the first time a poster shows a chart rather than with the app.
// The vector PDF exporter imports it too, so both share one cached chunk.
import type { Chart as ChartClass } from 'chart.js';

let loading: Promise<typeof ChartClass> | undefined;

export function loadChartJs(): Promise<typeof ChartClass> {
  loading ??= import('chart.js').then(({ Chart, registerables }) => {
    Chart.register(...registerables);
    return Chart;
  });
  return loading;
}
