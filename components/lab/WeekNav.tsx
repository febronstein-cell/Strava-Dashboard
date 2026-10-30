"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";

export interface WeekRow {
  start: string;
  /** colour of the phase of the week */
  color: string;
  /** short label: "Base", "Build week", the phase name... */
  label: string;
  plannedH: number;
  targetH: number | null;
  fill: "complete" | "partial" | "empty";
  state: "past" | "current" | "future";
  /** the race this stretch builds towards: a banner is drawn when it changes */
  banner?: string;
}

const Mark = ({ fill }: { fill: WeekRow["fill"] }) => (
  <span aria-hidden className={`inline-flex size-4 items-center justify-center rounded-full border text-[10px] leading-none ${fill === "complete" ? "border-brand bg-brand text-bg" : fill === "partial" ? "border-brand text-brand" : "border-line text-muted"}`}>
    {fill === "complete" ? "✓" : fill === "partial" ? "◐" : ""}
  </span>
);

/**
 * Where you are in the year. On a computer it is a sidebar that stays in view while you work on one week; on a phone
 * it is a strip of weeks to swipe, with arrows. Each week shows its dates, its label, planned hours against the
 * target, and whether the week is filled in.
 */
export function WeekNav({ rows, sel, onSel }: { rows: WeekRow[]; sel: string; onSel: (w: string) => void }) {
  const { t, fmt } = useI18n();
  const strip = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLDivElement>(null);
  const idx = rows.findIndex((r) => r.start === sel);
  const date = (iso: string) => fmt.dateLabel(`${iso}T00:00:00`, { day: "2-digit", month: "short" });
  const end = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") + 6 * 86_400_000).toISOString().slice(0, 10);

  // keep the selected week in view in both lists
  useEffect(() => {
    for (const box of [strip.current, side.current]) {
      const el = box?.querySelector<HTMLElement>(`[data-week="${sel}"]`);
      if (box && el && box.offsetParent !== null) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (box === strip.current) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: reduce ? "auto" : "smooth" });
        else box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: reduce ? "auto" : "smooth" });
      }
    }
  }, [sel]);

  return (
    <>
      {/* phone: arrows and a strip of weeks */}
      <div className="lg:hidden">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button onClick={() => idx > 0 && onSel(rows[idx - 1].start)} disabled={idx <= 0} aria-label={t("Previous week")} className="label rounded-full border border-line px-4 py-2.5 disabled:opacity-40">←</button>
          <p className="label text-center">
            {date(sel)} – {date(end(sel))}
            {rows[idx]?.state === "current" && <span className="ml-2 text-brand">{t("this week")}</span>}
          </p>
          <button onClick={() => idx < rows.length - 1 && onSel(rows[idx + 1].start)} disabled={idx >= rows.length - 1} aria-label={t("Next week")} className="label rounded-full border border-line px-4 py-2.5 disabled:opacity-40">→</button>
        </div>
        <div ref={strip} className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label={t("Weeks")}>
          {rows.map((r) => (
            <button
              key={r.start}
              data-week={r.start}
              role="tab"
              aria-selected={r.start === sel}
              onClick={() => onSel(r.start)}
              className={`relative flex shrink-0 snap-center flex-col items-start gap-1 rounded-2xl border px-3 py-2 text-left transition-colors ${r.start === sel ? "lab-tab-on border-fg bg-fg text-bg" : "border-line"}`}
              style={r.start === sel ? undefined : { borderTop: `3px solid ${r.color}` }}
            >
              <span className="label">{date(r.start)}</span>
              <span className="num text-lg leading-none">{r.plannedH > 0 ? `${fmt.num(r.plannedH, 1)} h` : "-"}</span>
              <Mark fill={r.fill} />
            </button>
          ))}
        </div>
      </div>

      {/* computer: a sidebar */}
      <aside className="hidden lg:block">
        <div ref={side} className="sticky top-40 max-h-[calc(100vh-11rem)] overflow-y-auto rounded-2xl border border-line p-2" role="tablist" aria-label={t("Weeks")}>
          {rows.map((r, i) => (
            <div key={r.start}>
              {r.banner && (
                <p className={`label px-2 pb-1 ${i === 0 ? "pt-1" : "pt-4"}`} style={{ color: "var(--goal)" }}>
                  {r.banner}
                </p>
              )}
              <button
                data-week={r.start}
                role="tab"
                aria-selected={r.start === sel}
                onClick={() => onSel(r.start)}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${r.start === sel ? "bg-fg text-bg" : "hover:bg-line/50"}`}
              >
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="min-w-0 flex-1">
                  <span className="label flex items-center gap-2">
                    {date(r.start)} – {date(end(r.start))}
                    {r.state === "current" && <span className={`rounded-full px-1.5 text-[10px] ${r.start === sel ? "bg-bg text-fg" : "bg-brand text-bg"}`}>{t("now")}</span>}
                  </span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{r.label}</span>
                    <span className="num shrink-0">
                      {r.plannedH > 0 ? fmt.num(r.plannedH, 1) : "-"}
                      {r.targetH ? <span className="label ml-1 normal-case opacity-70">/ {fmt.num(r.targetH, 0)} h</span> : null}
                    </span>
                  </span>
                  {r.targetH ? (
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-current opacity-20">
                      <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${Math.min(100, (r.plannedH / r.targetH) * 100)}%`, opacity: 5 }} />
                    </span>
                  ) : null}
                </span>
                <Mark fill={r.fill} />
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
