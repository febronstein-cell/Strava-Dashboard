"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

const SEEN_KEY = "lab-teaser-seen";
/** The teaser appears when the visitor reaches the first of these sections that exists. */
const TRIGGERS = ["heart", "notable", "stats"];

/**
 * A small card that invites the visitor to the Lab page, once per visit, when they have scrolled
 * far enough to be reading the numbers (the heart-rate section). It waits while a pop-up is open.
 */
export function LabTeaser() {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
    } catch {}
    const target = TRIGGERS.map((id) => document.getElementById(id)).find(Boolean);
    if (!target) return;

    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      // never on top of another pop-up (race reminder, workout window)
      if (document.querySelector("dialog[open]") && tries++ < 6) {
        timer = setTimeout(open, 4000);
        return;
      }
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          timer = setTimeout(open, 700);
        }
      },
      { threshold: 0.25 },
    );
    io.observe(target);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const close = () => {
    setShown(false);
    setTimeout(() => setMounted(false), 350);
  };

  if (!mounted) return null;

  return (
    <aside
      role="complementary"
      aria-label={t("The Lab")}
      className={`fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-sm sm:bottom-6 rounded-3xl border border-brand/60 bg-elev p-5 shadow-2xl transition-all duration-300 sm:left-auto sm:right-6 sm:mx-0 ${
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full opacity-25 blur-3xl" style={{ background: "var(--brand)" }} />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="label flex items-center gap-2 text-brand">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            {t("New")}
          </p>
          <button onClick={close} aria-label={t("Close")} className="label -mr-2 -mt-2 rounded-full px-3 py-2 transition-colors hover:text-fg">
            ✕
          </button>
        </div>
        <h3 className="num mt-2 text-3xl uppercase">{t("The Lab")}</h3>
        <p className="mt-1.5 text-sm text-muted">{t("Thresholds and zones, fitness and fatigue, race builds and a reading of every workout: my training, decoded.")}</p>
        <Link href="/lab" onClick={close} className="label mt-4 inline-block rounded-full border border-brand px-4 py-2.5 text-brand transition-colors hover:bg-brand hover:text-bg">
          {t("Open the Lab")} →
        </Link>
      </div>
    </aside>
  );
}
