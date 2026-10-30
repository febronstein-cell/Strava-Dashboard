"use client";

import { useI18n } from "@/lib/i18n";
import { usePlanSession } from "@/lib/use-plan-session";

/**
 * The only trace of the Context Log on the public dashboard: a neutral badge saying there is an open event, with no
 * text, no type and no detail. Once this device is unlocked, the Today card shows the real thing instead.
 */
export function OpenEventBadge({ count }: { count: number }) {
  const { t } = useI18n();
  const session = usePlanSession();
  if (count <= 0 || session.state === "checking" || session.unlocked) return null;
  return (
    <p className="label inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5">
      <span className="size-2 rounded-full bg-[var(--goal)]" aria-hidden />
      {t("Open event")}
    </p>
  );
}
