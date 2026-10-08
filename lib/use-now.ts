"use client";

import { useSyncExternalStore } from "react";

/**
 * Hora atual em ms, arredondada por `stepMs`. No servidor (e na hidratação)
 * usa `serverNow` para o HTML bater; depois passa a usar o relógio do navegador.
 */
export function useNow(serverNow: number, stepMs = 60_000): number {
  return useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, stepMs);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / stepMs) * stepMs,
    () => Math.floor(serverNow / stepMs) * stepMs,
  );
}
