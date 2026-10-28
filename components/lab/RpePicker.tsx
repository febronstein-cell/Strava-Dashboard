"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

/** Session RPE 1 to 10 for one activity. Saves at once (planner unlock needed) and refreshes the page data. */
export function RpePicker({ activityId, value, editable }: { activityId: number; value?: number; editable: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState<number | undefined>(value);
  const [state, setState] = useState<"idle" | "saving" | `error:${string}`>("idle");

  const pick = async (n: number) => {
    const next = v === n ? null : n;
    setV(next ?? undefined);
    setState("saving");
    const res = await fetch("/api/rpe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId, rpe: next }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setV(value);
      return setState(`error:${j.error ?? res.status}`);
    }
    setState("idle");
    router.refresh();
  };

  return (
    <div>
      <div className="grid grid-cols-10 gap-1" role="group" aria-label={t("Session RPE")}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            disabled={!editable || state === "saving"}
            onClick={() => void pick(n)}
            aria-pressed={v === n}
            className={`num rounded-lg border py-2 text-lg transition-colors disabled:opacity-60 ${v === n ? "border-fg bg-fg text-bg" : "border-line hover:border-fg"}`}
          >
            {n}
          </button>
        ))}
      </div>
      {state.startsWith("error:") && <p className="mt-1 text-xs" style={{ color: "var(--goal)" }}>{state.slice(6)}</p>}
    </div>
  );
}
