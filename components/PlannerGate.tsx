"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { siteConfig } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import { usePlanSession } from "@/lib/use-plan-session";


/**
 * A button that asks for the planner's edit key and opens the planner only after the server confirms it.
 * It is used next to every "Lab" link of the dashboard and in the Lab itself.
 */
export function PlannerGate({ className, style, children, ariaLabel }: { className?: string; style?: CSSProperties; children: ReactNode; ariaLabel?: string }) {
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
      {open && <KeyDialog onClose={() => setOpen(false)} unlock={session.unlock} />}
    </>
  );
}

function KeyDialog({ onClose, unlock }: { onClose: () => void; unlock: (key: string) => Promise<boolean | null> }) {
  const { t } = useI18n();
  const router = useRouter();
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
    try {
      const ok = await unlock(value);
      if (!ok) {
        setState(ok === false ? "wrong" : "error");
        return;
      }
      if (window.location.pathname === "/lab") {
        window.location.hash = siteConfig.lab.planHash;
        onClose();
      } else {
        router.push(`/lab#${siteConfig.lab.planHash}`);
      }
    } catch {
      setState("error");
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(26rem,calc(100vw-1.5rem))] rounded-3xl border border-line bg-elev p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label" style={{ color: "var(--goal)" }}>{t("Training planner")}</p>
            <h3 className="num mt-1 text-3xl uppercase">{t("Enter the code")}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="label -mr-2 rounded-full px-3 py-2 transition-colors hover:text-fg">✕</button>
        </div>
        <p className="mt-3 text-sm text-muted">{t("The planner opens only with the edit key.")}</p>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setState("idle");
          }}
          placeholder={t("Edit key")}
          autoComplete="off"
          autoFocus
          className="mt-5 w-full rounded-full border border-line bg-bg px-4 py-3 text-fg"
        />
        <div className="mt-2 min-h-5 text-sm" style={{ color: "var(--goal)" }}>
          {state === "wrong" ? t("Wrong key") : state === "error" ? t("Could not check the key") : ""}
        </div>
        <button
          type="submit"
          disabled={!value || state === "checking"}
          className="label mt-3 w-full rounded-full border border-brand px-4 py-3 text-brand transition-colors hover:bg-brand hover:text-bg disabled:opacity-50"
        >
          {state === "checking" ? t("Checking…") : t("Open the planner")}
        </button>
      </form>
    </dialog>
  );
}
