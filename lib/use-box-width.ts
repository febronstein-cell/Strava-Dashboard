"use client";

import { useEffect, useState, type RefCallback } from "react";

/**
 * The real width of the box a chart sits in, so the chart can draw itself in real pixels: on a phone its text stays
 * as big as it was designed (a fixed 600-unit drawing squeezed into 340 px made 9-unit labels about 5 px tall).
 * Returns the ref to put on the chart's <svg> (it measures the svg's parent) and the width to draw with.
 * The ref is a callback, so it also works for a chart that appears after the first render.
 * Before it is measured (server render, first paint) it returns `fallback`, so the markup matches.
 */
export function useBoxWidth(fallback: number, min = 280, max = 960): [RefCallback<SVGSVGElement>, number] {
  const [el, setEl] = useState<SVGSVGElement | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const parent = el?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const next = Math.round(e.contentRect.width);
      if (next > 0) setW(Math.min(max, Math.max(min, next)));
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [el, min, max]);
  return [setEl, w];
}
