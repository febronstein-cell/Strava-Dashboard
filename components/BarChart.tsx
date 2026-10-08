"use client";

import { useState } from "react";

export interface BarItem {
  key: string;
  label: string;
  /** texto curto no eixo (se omitido, usa `label`) */
  axis?: string;
  /** partes empilhadas da barra */
  segments: { name: string; value: number; color: string }[];
}

/**
 * Gráfico de barras empilhadas, leve (div + CSS), com leitura ao passar o mouse
 * ou tocar. `format` transforma o valor numérico no texto exibido.
 */
export function BarChart({
  items,
  format,
  height = 170,
  labelEvery = 1,
  defaultText,
}: {
  items: BarItem[];
  format: (v: number) => string;
  height?: number;
  labelEvery?: number;
  /** texto da leitura quando nada está selecionado */
  defaultText?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const totals = items.map((it) => it.segments.reduce((a, s) => a + s.value, 0));
  const max = Math.max(...totals, 0) || 1;
  const sel = active !== null ? items[active] : null;

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div className="min-h-[3.4rem]">
        {sel && active !== null ? (
          <>
            <p className="label">{sel.label}</p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="num text-3xl">{format(totals[active])}</span>
              {sel.segments
                .filter((s) => s.value > 0)
                .map((s) => (
                  <span key={s.name} className="inline-flex items-center gap-1.5 text-sm text-muted">
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    {format(s.value)}
                  </span>
                ))}
            </p>
          </>
        ) : (
          <p className="label pt-1">{defaultText ?? "Passe o mouse (ou toque) nas barras"}</p>
        )}
      </div>

      <div className="flex items-end gap-[3px] border-b border-line" style={{ height }}>
        {items.map((it, i) => {
          const t = totals[i];
          return (
            <button
              key={it.key}
              type="button"
              aria-label={`${it.label}: ${format(t)}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="flex h-full flex-1 flex-col justify-end outline-none"
            >
              <div
                className="flex flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity"
                style={{ height: `${(t / max) * 100}%`, opacity: active === null || active === i ? 1 : 0.35 }}
              >
                {it.segments.map((s) =>
                  s.value > 0 ? (
                    <div
                      key={s.name}
                      className="bar-seg"
                      style={{ flex: `${s.value} 1 0%`, background: s.color, animationDelay: `${i * 25}ms` }}
                    />
                  ) : null,
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex gap-[3px]">
        {items.map((it, i) => (
          <span key={it.key} className="label flex-1 text-center text-[0.6rem]">
            {i % labelEvery === 0 ? (it.axis ?? it.label) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
