"use client";

import { useCallback, useEffect, useState } from "react";

const EVENT = "plan-session";

/**
 * Whether this device may edit the planner. The server keeps the answer in a signed httpOnly cookie (30 days),
 * so the browser never holds the key. "checking" until the server answers.
 */
export function usePlanSession() {
  const [state, setState] = useState<"checking" | "locked" | "unlocked">("checking");

  useEffect(() => {
    let alive = true;
    const read = () =>
      fetch("/api/plan/verify", { cache: "no-store" })
        .then((r) => r.json() as Promise<{ unlocked?: boolean }>)
        .then((j) => alive && setState(j.unlocked ? "unlocked" : "locked"))
        .catch(() => alive && setState("locked"));
    void read();
    window.addEventListener(EVENT, read);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, read);
    };
  }, []);

  /** Sends the key once; true when the server accepted it and unlocked the device. null when it could not be checked. */
  const unlock = useCallback(async (key: string): Promise<boolean | null> => {
    try {
      const res = await fetch("/api/plan/verify", { method: "POST", headers: { "x-plan-key": key } });
      if (res.ok) {
        setState("unlocked");
        window.dispatchEvent(new Event(EVENT));
        return true;
      }
      return res.status === 401 ? false : null;
    } catch {
      return null;
    }
  }, []);

  const lock = useCallback(async () => {
    await fetch("/api/plan/verify", { method: "DELETE" }).catch(() => undefined);
    setState("locked");
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { state, unlocked: state === "unlocked", unlock, lock };
}
