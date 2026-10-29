"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { DAY_NAMES, PLAN_SPORTS, SPORT_LABEL, dayFilled, fmtMinutes, slotFilled } from "@/lib/lab/plan";
import type { PlanDay, PlanSlot, PlanSport } from "@/lib/lab/types";
import { SPORT_COLOR, SlotEditor } from "./SlotEditor";

/** An edit of the planner: fields of one session, the rest-day switch, a new double, or removing a double. */
export type SlotPatch = Partial<PlanSlot> | { rest: boolean } | { add: PlanSport } | { remove: true };

export const dayMinutes = (d: PlanDay) => (d.rest ? 0 : d.slots.reduce((s, x) => s + (x.minutes ?? 0), 0));

/** The week as seven buttons: the day, its hours, and a dot for each sport planned. Tap one to edit that day. */
export function DayStrip({ days, sel, onSel, today, weekStart }: { days: PlanDay[]; sel: number; onSel: (d: number) => void; today: string; weekStart: string }) {
  const { t } = useI18n();
  const dateOf = (i: number) => new Date(Date.parse(weekStart + "T00:00:00Z") + i * 86_400_000).toISOString().slice(8, 10);
  const todayIdx = Math.round((Date.parse(today) - Date.parse(weekStart)) / 86_400_000);
  const maxMin = Math.max(60, ...days.map(dayMinutes));
  return (
    <div role="tablist" aria-label={t("Days of the week")} className="grid grid-cols-7 gap-1 sm:gap-2">
      {days.map((d) => {
        const min = dayMinutes(d);
        const sports = new Set(d.slots.filter(slotFilled).map((s) => s.sport));
        const on = sel === d.day;
        return (
          <button
            key={d.day}
            role="tab"
            aria-selected={on}
            onClick={() => onSel(d.day)}
            className={`relative flex min-w-0 flex-col items-center gap-1 rounded-2xl border px-0.5 pb-2 pt-2 transition-colors sm:px-2 ${on ? "lab-tab-on border-fg bg-fg text-bg" : "border-line hover:border-fg"}`}
          >
            <span className="label text-[0.62rem] sm:text-xs">{t(DAY_NAMES[d.day]).slice(0, 3)}</span>
            <span className={`label text-[0.6rem] ${d.day === todayIdx && !on ? "text-brand" : ""}`}>{dateOf(d.day)}</span>
            <span className="num text-sm leading-none sm:text-lg">{d.rest ? "—" : min > 0 ? fmtMinutes(min) : "·"}</span>
            {/* a bar as tall as the day is long, so the shape of the week reads at a glance */}
            <span className="relative h-6 w-1.5 overflow-hidden rounded-full bg-current opacity-15 sm:h-8 sm:w-2" aria-hidden>
              <span className="absolute inset-x-0 bottom-0 rounded-full bg-[var(--brand)]" style={{ height: `${d.rest ? 0 : (min / maxMin) * 100}%`, opacity: 6.5 }} />
            </span>
            <span className="flex h-2 gap-0.5" aria-hidden>
              {[...sports].slice(0, 4).map((sp) => (
                <span key={sp} className="size-1.5 rounded-full" style={{ background: SPORT_COLOR[sp] }} />
              ))}
              {d.rest && <span className="label text-[0.55rem] leading-none">R</span>}
            </span>
            {!dayFilled(d) && <span className="absolute right-1 top-1 size-1.5 rounded-full border border-current opacity-50" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The selected day: only the sessions that have something in them, plus chips to add the other sports. Fewer rows
 * on screen, so the page is short on a phone.
 */
export function DayEditor({
  day,
  weekStart,
  editable,
  onEdit,
}: {
  day: PlanDay;
  weekStart: string;
  editable: boolean;
  onEdit: (day: number, idx: number | null, patch: SlotPatch) => void;
}) {
  const { t } = useI18n();
  // slots opened by hand stay on screen while they are being typed into, even if they are still empty
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const key = (idx: number) => `${weekStart}:${day.day}:${idx}`;
  const visible = day.slots.map((s, idx) => ({ s, idx })).filter(({ s, idx }) => idx >= PLAN_SPORTS.length || slotFilled(s) || opened.has(key(idx)));
  const hidden = day.slots.map((s, idx) => ({ s, idx })).filter(({ idx }) => idx < PLAN_SPORTS.length && !visible.some((v) => v.idx === idx));
  const open = (idx: number) => setOpened((o) => new Set(o).add(key(idx)));

  return (
    <div className="fade-up space-y-4" key={`${weekStart}-${day.day}`}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="num text-2xl uppercase">{t(DAY_NAMES[day.day])}</h4>
        <label className="label flex items-center gap-2">
          <input type="checkbox" checked={Boolean(day.rest)} disabled={!editable} onChange={(e) => onEdit(day.day, null, { rest: e.target.checked })} className="h-5 w-5 accent-[var(--brand)]" />
          {t("Rest day")}
        </label>
      </div>

      {day.rest ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{t("Rest day: nothing planned.")}</p>
      ) : (
        <>
          {visible.length === 0 && <p className="text-sm text-muted">{t("Nothing planned yet: add a session below.")}</p>}
          <div className="space-y-4">
            {visible.map(({ s, idx }) => {
              const same = day.slots.filter((x) => x.sport === s.sport && (slotFilled(x) || x === s));
              const order = same.indexOf(s);
              const label = `${t(SPORT_LABEL[s.sport])}${same.length > 1 ? ` · ${order === 0 ? t("AM") : t("PM")}` : ""}`;
              return (
                <div key={idx} className="rounded-2xl border border-line p-3 sm:p-4" style={{ borderLeft: `3px solid ${SPORT_COLOR[s.sport]}` }}>
                  <SlotEditor
                    slot={s}
                    label={label}
                    editable={editable}
                    idKey={`${weekStart}-${day.day}-${idx}`}
                    onChange={(patch) => {
                      open(idx);
                      onEdit(day.day, idx, patch);
                    }}
                    onRemove={idx >= PLAN_SPORTS.length ? () => onEdit(day.day, idx, { remove: true }) : undefined}
                  />
                </div>
              );
            })}
          </div>

          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label">{t("Add")}:</span>
              {hidden.map(({ s, idx }) => (
                <button key={idx} onClick={() => open(idx)} className="label rounded-full border border-line px-3 py-2 transition-colors hover:border-fg hover:text-fg" style={{ color: SPORT_COLOR[s.sport] }}>
                  + {t(SPORT_LABEL[s.sport])}
                </button>
              ))}
              {(["run", "ride", "swim", "strength"] as PlanSport[])
                .filter((sp) => day.slots.some((x) => x.sport === sp && slotFilled(x)))
                .map((sp) => (
                  <button key={`d-${sp}`} onClick={() => onEdit(day.day, null, { add: sp })} className="label rounded-full border border-dashed border-line px-3 py-2 hover:text-fg" title={t("A second session of the same sport (AM and PM)")}>
                    + {t(SPORT_LABEL[sp])} ×2
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
