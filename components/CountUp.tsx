"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * A number that "climbs" from 0 to its value when it appears on screen.
 *
 * The page HTML holds only the final value, so anything that reads the page as text (search engines, screen readers,
 * a plain fetch) sees "323 W" and never a stray 0. The climbing digits are drawn on top while the animation runs and
 * removed when it ends. With JavaScript on, the final value stays hidden until then (see `.countup` in globals.css).
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
  const { locale } = useI18n();
  const fmt = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    [locale, decimals],
  );
  const ref = useRef<HTMLSpanElement>(null);
  // null = the animation is over (or never ran): only the final value is in the page
  const [shown, setShown] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // with reduced motion the final value is shown at once (globals.css)
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // easeOutExpo
          if (t < 1) {
            setShown(value * eased);
            raf = requestAnimationFrame(tick);
          } else {
            setShown(null);
            setDone(true);
          }
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
    <span ref={ref} className={`countup relative inline-block whitespace-nowrap ${className}`} data-done={done ? "" : undefined}>
      <span className="countup-final">{fmt.format(value)}</span>
      {shown !== null && (
        <span aria-hidden="true" className="absolute left-0 top-0">
          {fmt.format(shown)}
        </span>
      )}
    </span>
  );
}
