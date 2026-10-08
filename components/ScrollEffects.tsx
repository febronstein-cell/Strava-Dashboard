"use client";

import { useEffect, useRef } from "react";
import { SportIcon } from "./SportIcon";

/**
 * Efeito de rolagem: uma barra no topo (nado → bike → corrida) enche conforme você
 * desce a página, e um mini atleta corre na ponta dela trocando de modalidade.
 * Também alimenta o parallax do topo (--sy no elemento #hero).
 * Atualiza variáveis CSS direto no DOM, sem re-renderizar o React.
 */
export function ScrollEffects() {
  const root = useRef<HTMLDivElement>(null);
  const runner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let sport = "";

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      root.current?.style.setProperty("--p", p.toFixed(4));
      document.getElementById("hero")?.style.setProperty("--sy", String(Math.min(y, 900)));
      const next = p < 0.34 ? "swim" : p < 0.67 ? "ride" : "run";
      if (next !== sport) {
        sport = next;
        runner.current?.setAttribute("data-sport", next);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={root} className="scroll-progress" aria-hidden="true">
      <div className="scroll-progress-bar" />
      <div ref={runner} className="scroll-runner" data-sport="swim">
        <SportIcon sport="swim" className="i-swim" />
        <SportIcon sport="ride" className="i-ride" />
        <SportIcon sport="run" className="i-run" />
      </div>
    </div>
  );
}
