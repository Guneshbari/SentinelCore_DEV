/**
 * EChart — headless ECharts wrapper (pure canvas, no SVG)
 *
 * Performance rules:
 *  - notMerge: false → incremental option update (no full re-render)
 *  - lazyUpdate: true → batches ECharts layout pass
 *  - ResizeObserver on container for precise resize handling
 */
import { useRef, useEffect, memo } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface EChartProps {
  option:    EChartsOption;
  style?:    React.CSSProperties;
  className?: string;
  theme?:    string;
}

export const EChart = memo(function EChart({ option, style, className }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<echarts.ECharts | null>(null);

  // Init once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, null, {
      renderer:  'canvas',
      useDirtyRect: true,
    });
    chartRef.current = chart;
    return () => {
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Update option incrementally
  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: false, lazyUpdate: true });
  }, [option]);

  // ResizeObserver for precise container resize (not just window)
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', ...style }}
      className={className}
    />
  );
});
