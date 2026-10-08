export interface HBarItem {
  label: string;
  sub?: string;
  value: number;
  color?: string;
}

/** Barras horizontais com rótulo à esquerda e valor à direita. */
export function HBarChart({
  items,
  format = (v) => String(v),
  color = "var(--brand)",
}: {
  items: HBarItem[];
  format?: (v: number) => string;
  color?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={it.label} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 sm:grid-cols-[8rem_1fr_3.5rem]">
          <span className="text-right">
            <span className="block text-sm leading-tight">{it.label}</span>
            {it.sub && <span className="label block text-[0.55rem]">{it.sub}</span>}
          </span>
          <span className="h-3.5 overflow-hidden rounded-[3px] bg-soft">
            <span
              className="bar-x block h-full rounded-[3px]"
              style={{
                width: `${(it.value / max) * 100}%`,
                background: it.color ?? color,
                animationDelay: `${i * 60}ms`,
              }}
            />
          </span>
          <span className="num text-xl text-muted">{format(it.value)}</span>
        </li>
      ))}
    </ul>
  );
}
