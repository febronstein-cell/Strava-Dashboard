"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePlanSession } from "@/lib/use-plan-session";
import { Panel } from "./LabBits";

const sec = (v: string) => {
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/**
 * Swim test: 400 m and 200 m all-out times give the critical swim speed, CSS = (T400 - T200) / 2 per 100 m.
 * Saved as a "css" test; from then on swims with a distance get their load from pace (IF = CSS pace / average pace).
 */
export function SwimTest({ todayKey }: { todayKey: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const session = usePlanSession();
  const [date, setDate] = useState(todayKey);
  const [t400, setT400] = useState("");
  const [t200, setT200] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (!session.unlocked) return null;

  const a = sec(t400);
  const b = sec(t200);
  const css = Number.isFinite(a) && Number.isFinite(b) && a > b ? (a - b) / 2 : null;

  const save = async () => {
    setMsg(null);
    const res = await fetch("/api/thresholds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, t400: a, t200: b }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setMsg(j.error ?? String(res.status));
    setMsg(t("Saved"));
    router.refresh();
  };

  return (
    <Panel title={t("Swim test (CSS)")} subtitle={t("Swim 400 m and 200 m all out (with rest between). CSS = (400 m time - 200 m time) / 2, per 100 m.")}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="label mb-1 block">{t("Date")}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
        </label>
        <label className="block">
          <span className="label mb-1 block">{t("400 m (m:ss)")}</span>
          <input value={t400} onChange={(e) => setT400(e.target.value)} placeholder="6:10" inputMode="text" className={INPUT} />
        </label>
        <label className="block">
          <span className="label mb-1 block">{t("200 m (m:ss)")}</span>
          <input value={t200} onChange={(e) => setT200(e.target.value)} placeholder="2:55" inputMode="text" className={INPUT} />
        </label>
        <div className="flex flex-col justify-end">
          <p className="num text-2xl">{css ? `${fmt.clock(css)} /100m` : "—"}</p>
          <button onClick={() => void save()} disabled={!css} className="label mt-1 rounded-full border border-brand px-4 py-2 text-brand hover:bg-brand hover:text-bg disabled:opacity-50">
            {t("Save the test")}
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </Panel>
  );
}

const INPUT = "w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-base text-fg";
