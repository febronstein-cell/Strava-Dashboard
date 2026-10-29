"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

/**
 * The password dialog. One password (the edit key) unlocks everything that edits or adds information on this device
 * for 30 days: the planner, the check-in, RPE, manual sessions, the season and the tests.
 * `unlock` sends the key to the server, which sets the signed cookie; `onDone` runs after it accepts it.
 */
export function KeyDialog({
  onClose,
  unlock,
  onDone,
  title,
  note,
  cta,
}: {
  onClose: () => void;
  unlock: (key: string) => Promise<boolean | null>;
  onDone: () => void;
  title?: string;
  note?: string;
  cta?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "wrong" | "error">("idle");

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value || state === "checking") return;
    setState("checking");
    const ok = await unlock(value);
    if (!ok) return setState(ok === false ? "wrong" : "error");
    onDone();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="key-dialog m-auto w-[min(26rem,calc(100vw-1.5rem))] rounded-3xl border border-line bg-elev p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label" style={{ color: "var(--goal)" }}>{t("Editing")}</p>
            <h3 className="num mt-1 text-3xl uppercase">{title ?? t("Enter the password")}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="label -mr-2 rounded-full px-3 py-2 transition-colors hover:text-fg">✕</button>
        </div>
        <p className="mt-3 text-sm text-muted">{note ?? t("One password unlocks everything that edits or adds information, on this device, for 30 days.")}</p>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setState("idle");
          }}
          placeholder={t("Password")}
          autoComplete="off"
          autoFocus
          className="mt-5 w-full rounded-full border border-line bg-bg px-4 py-3 text-fg"
        />
        <div className="mt-2 min-h-5 text-sm" style={{ color: "var(--goal)" }}>
          {state === "wrong" ? t("Wrong password") : state === "error" ? t("Could not check the password") : ""}
        </div>
        <button
          type="submit"
          disabled={!value || state === "checking"}
          className="label mt-3 w-full rounded-full border border-brand px-4 py-3 text-brand transition-colors hover:bg-brand hover:text-bg disabled:opacity-50"
        >
          {state === "checking" ? t("Checking…") : (cta ?? t("Unlock editing"))}
        </button>
      </form>
    </dialog>
  );
}
