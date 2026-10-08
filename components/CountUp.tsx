"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { siteConfig } from "@/site.config";

/**
 * Número que "sobe" de 0 até o valor quando aparece na tela.
 * O valor final fica num <span> invisível (sr-only) para leitores de tela e buscadores.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 1600,
  className = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const fmt = useMemo(
    () =>
      new Intl.NumberFormat(siteConfig.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    [decimals],
  );
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        if (reduced) {
          setShown(value);
          return;
        }
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // easeOutExpo
          setShown(value * eased);
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{fmt.format(value)}</span>
      <span aria-hidden="true">{fmt.format(shown)}</span>
    </span>
  );
}
