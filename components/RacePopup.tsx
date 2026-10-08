"use client";

import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import { upcoming } from "@/lib/races";
import { useNow } from "@/lib/use-now";

const SEEN_KEY = "race-popup-seen";

/** Pop-up about the next race, shown once per visit a few seconds after the page opens. */
export function RacePopup({ serverNow }: { serverNow: number }) {
  const { t, fmt } = useI18n();
  const now = useNow(serverNow, 3_600_000);
  const next = upcoming(now)[0];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  // opens once per session, after the intro animation
  useEffect(() => {
    if (!siteConfig.racePopup || !next) return;
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
    } catch {}
    const id = setTimeout(() => {
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
      setOpen(true);
    }, 3200);
    return () => clearTimeout(id);
  }, [next]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!next) return null;

  return (
    <dialog
      ref={ref}
      onClose={() => setOpen(false)}
      onClick={(e) => {
        if (e.target === ref.current) setOpen(false);
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-goal/50 bg-elev p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="relative p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--goal)" }}
        />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <p className="label" style={{ color: "var(--goal)" }}>
              {t("Next race")}
            </p>
            <button
              onClick={() => setOpen(false)}
              aria-label={t("Close")}
              className="label -mt-2 -mr-2 rounded-full px-3 py-2 transition-colors hover:text-fg"
            >
              ✕
            </button>
          </div>

          <h3 className="num mt-3 text-4xl uppercase sm:text-5xl">{next.name}</h3>
          <p className="mt-2 text-muted">
            {next.location ? `${t(next.location)} · ` : ""}
            {fmt.dateLabel(`${next.date}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" })}
          </p>
          {next.note && <p className="mt-1 text-sm text-muted">{t(next.note)}</p>}

          <div className="mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="num text-8xl leading-none" style={{ color: "var(--goal)" }}>
                {next.days > 0 ? next.days : "!"}
              </p>
              <p className="label mt-2">
                {next.days === 0 ? t("It is race day!") : t("day to go|days to go", { n: next.days })}
              </p>
            </div>
            <a
              href="#races"
              onClick={() => setOpen(false)}
              className="label rounded-full border border-line px-4 py-2.5 transition-colors hover:text-fg"
            >
              {t("See races")} →
            </a>
          </div>
        </div>
      </div>
    </dialog>
  );
}
