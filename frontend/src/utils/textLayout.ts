import { useEffect, useRef, useState } from 'react';
import {
  clearCache as clearPretextCache,
  layout,
  prepare,
  type LayoutResult,
  type PreparedText,
} from '@chenglou/pretext';

export const ENABLE_PRETEXT_OPTIMIZATION = true;

type MeasureOptions = {
  font?: string;
  lineHeight?: number;
  whiteSpace?: 'normal' | 'pre-wrap';
};

type MeasureResult = LayoutResult & {
  width: number;
  font: string;
  lineHeight: number;
};

const preparedCache = new Map<string, PreparedText>();
const layoutCache = new Map<string, MeasureResult>();

function buildPreparedKey(text: string, font: string, whiteSpace: 'normal' | 'pre-wrap'): string {
  return `${font}__${whiteSpace}__${text}`;
}

function buildLayoutKey(text: string, width: number, font: string, lineHeight: number, whiteSpace: 'normal' | 'pre-wrap'): string {
  return `${font}__${lineHeight}__${width}__${whiteSpace}__${text}`;
}

function approximateMeasure(text: string, width: number, font: string, lineHeight: number): MeasureResult {
  const safeWidth = Math.max(width, 1);
  const averageCharWidth = Math.max(parseInt(font, 10) * 0.58, 7);
  const estimatedLines = Math.max(1, Math.ceil((text.length * averageCharWidth) / safeWidth));
  return {
    width: safeWidth,
    font,
    lineHeight,
    lineCount: estimatedLines,
    height: estimatedLines * lineHeight,
  };
}

export function measureText(
  text: string,
  width: number,
  options: MeasureOptions = {},
): MeasureResult {
  const font = options.font ?? '14px Inter';
  const lineHeight = options.lineHeight ?? 20;
  const whiteSpace = options.whiteSpace ?? 'normal';
  const normalizedText = text || ' ';
  const safeWidth = Math.max(Math.floor(width), 1);

  if (!ENABLE_PRETEXT_OPTIMIZATION) {
    return approximateMeasure(normalizedText, safeWidth, font, lineHeight);
  }

  const layoutKey = buildLayoutKey(normalizedText, safeWidth, font, lineHeight, whiteSpace);
  const cachedLayout = layoutCache.get(layoutKey);
  if (cachedLayout) {
    return cachedLayout;
  }

  const preparedKey = buildPreparedKey(normalizedText, font, whiteSpace);
  let preparedText = preparedCache.get(preparedKey);
  if (!preparedText) {
    preparedText = prepare(normalizedText, font, { whiteSpace });
    preparedCache.set(preparedKey, preparedText);
  }

  const result = layout(preparedText, safeWidth, lineHeight);
  const measured: MeasureResult = {
    ...result,
    width: safeWidth,
    font,
    lineHeight,
  };
  layoutCache.set(layoutKey, measured);
  return measured;
}

export function invalidateTextLayoutForWidth(width: number): void {
  const widthToken = `__${Math.max(Math.floor(width), 1)}__`;
  for (const key of layoutCache.keys()) {
    if (key.includes(widthToken)) {
      layoutCache.delete(key);
    }
  }
}

export function clearTextLayoutCaches(): void {
  preparedCache.clear();
  layoutCache.clear();
  clearPretextCache();
}

export function useDebouncedElementWidth<T extends HTMLElement>(delayMs = 80): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let previousWidth = Math.floor(element.clientWidth);

    setWidth(previousWidth);

    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (previousWidth !== nextWidth) {
          invalidateTextLayoutForWidth(previousWidth);
          previousWidth = nextWidth;
          setWidth(nextWidth);
        }
      }, delayMs);
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [delayMs]);

  return [ref, width];
}
