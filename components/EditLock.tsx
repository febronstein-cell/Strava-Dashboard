"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePlanSession } from "@/lib/use-plan-session";
import { KeyDialog } from "./KeyDialog";

const Lock = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d={open ? "M8 10.5V7.5a4 4 0 0 1 7.6-1.7" : "M8 10.5V7.5a4 4 0 0 1 8 0v3"} />
  </svg>
);

/**
 * The lock of the Lab: shows whether editing is unlocked on this device. Tap it to enter the password, or, when
 * unlocked, to lock again. Everything that edits or adds information needs it (the server checks it too).
 */
export function EditLock() {
  const { t } = useI18n();
  const session = usePlanSession();
  const [open, setOpen] = useState(false);
  if (session.state === "checking") return <span className="inline-block size-9" aria-hidden />;
  const on = session.unlocked;
  return (
    <>
      <button
        type="button"
        onClick={() => (on ? void session.lock() : setOpen(true))}
        aria-label={on ? t("Editing unlocked: tap to lock") : t("Editing locked: tap to unlock")}
        title={on ? t("Editing unlocked: tap to lock") : t("Editing locked: tap to unlock")}
        className={`label inline-flex h-9 items-center gap-1.5 rounded-full border px-3 transition-colors ${on ? "border-brand text-brand" : "border-line hover:text-fg"}`}
      >
        <Lock open={on} />
        <span className="hidden sm:inline">{on ? t("Editing on") : t("Locked")}</span>
      </button>
      {open && <KeyDialog onClose={() => setOpen(false)} unlock={session.unlock} onDone={() => setOpen(false)} />}
    </>
  );
}

/**
 * Where something can be edited but this device is locked: a small line that says so and opens the password dialog.
 * Renders nothing once unlocked.
 */
export function LockedHint({ what }: { what?: string }) {
  const { t } = useI18n();
  const session = usePlanSession();
  const [open, setOpen] = useState(false);
  if (session.state === "checking" || session.unlocked) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="label inline-flex items-center gap-2 rounded-full border border-dashed border-line px-4 py-2.5 text-left transition-colors hover:border-fg hover:text-fg"
      >
        <Lock open={false} />
        {what ?? t("Enter the password to edit")}
      </button>
      {open && <KeyDialog onClose={() => setOpen(false)} unlock={session.unlock} onDone={() => setOpen(false)} />}
    </>
  );
}
