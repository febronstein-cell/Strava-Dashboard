"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * The real width of the box a chart sits in, so the chart can draw itself in real pixels: on a phone its text stays
 * as big as it was designed (a fixed 600-unit drawing squeezed into 340 px made 9-unit labels about 5 px tall).
 * Returns the ref to put on the chart's <svg> (it measures the svg's parent) and the width to draw with.
 * Before it is measured (server render, first paint) it returns `fallback`, so the markup matches.
 */
export function useBoxWidth(fallback: number, min = 280, max = 960): [RefObject<SVGSVGElement | null>, number] {
  const ref = useRef<SVGSVGElement | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const next = Math.round(e.contentRect.width);
      if (next > 0) setW(Math.min(max, Math.max(min, next)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [min, max]);
  return [ref, w];
}
