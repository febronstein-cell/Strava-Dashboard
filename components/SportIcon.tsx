import type { SportKey } from "@/site.config";

/** Ícones simples de traço. Podemos trocar por outros quando definirmos a identidade. */
export function SportIcon({ sport, className = "size-6" }: { sport: SportKey; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  if (sport === "run") {
    return (
      <svg {...common}>
        <circle cx="15" cy="4.5" r="1.8" />
        <path d="M13 9l-3.2 4.2 3.2 2.3 1 5M9.8 13.2L6 14.2M13 9l3.8 2.6 3.2-.4M13 15.5l3.5 1.2" />
      </svg>
    );
  }
  if (sport === "ride") {
    return (
      <svg {...common}>
        <circle cx="6" cy="16" r="3.5" />
        <circle cx="18" cy="16" r="3.5" />
        <path d="M6 16l4-8h5l3 8M10 8l4.5 8M9 6h3" />
      </svg>
    );
  }
  if (sport === "other") {
    return (
      <svg {...common}>
        <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
      </svg>
    );
  }
  if (sport === "strength") {
    return (
      <svg {...common}>
        <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="16.5" cy="6" r="1.8" />
      <path d="M8 11l4-2 3 3M2 16c2 0 2-1.4 4-1.4s2 1.4 4 1.4 2-1.4 4-1.4 2 1.4 4 1.4 2-1.4 4-1.4M2 20.5c2 0 2-1.4 4-1.4s2 1.4 4 1.4 2-1.4 4-1.4 2 1.4 4 1.4 2-1.4 4-1.4" />
    </svg>
  );
}
