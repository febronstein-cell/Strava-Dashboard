"use client";

import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { siteConfig } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import { usePlanSession } from "@/lib/use-plan-session";
import { KeyDialog } from "./KeyDialog";

/**
 * A button that asks for the planner's edit key and opens the planner only after the server confirms it.
 * It is used next to every "Lab" link of the dashboard and in the Lab itself.
 */
export function PlannerGate({ className, style, children, ariaLabel }: { className?: string; style?: CSSProperties; children: ReactNode; ariaLabel?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const session = usePlanSession();
  const router = useRouter();
  // a device unlocked in the last 30 days goes straight in
  const go = () => {
    if (!session.unlocked) return setOpen(true);
    if (window.location.pathname === "/lab") window.location.hash = siteConfig.lab.planHash;
    else router.push(`/lab#${siteConfig.lab.planHash}`);
  };
  return (
    <>
      <button type="button" onClick={go} className={className} style={style} aria-label={ariaLabel}>
        {children}
      </button>
      {open && (
        <KeyDialog
          onClose={() => setOpen(false)}
          unlock={session.unlock}
          title={t("Open the planner")}
          cta={t("Open the planner")}
          onDone={() => {
            setOpen(false);
            if (window.location.pathname === "/lab") window.location.hash = siteConfig.lab.planHash;
            else router.push(`/lab#${siteConfig.lab.planHash}`);
          }}
        />
      )}
    </>
  );
}
