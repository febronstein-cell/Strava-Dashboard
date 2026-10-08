import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/** Moldura padrão de cada seção: largura, espaçamento e cabeçalho. */
export function SectionShell({
  id,
  title,
  kicker,
  aside,
  children,
}: {
  id: string;
  title: string;
  /** Texto pequeno ao lado do título (ex.: o período mostrado). */
  kicker?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-32 px-5 py-14 sm:scroll-mt-28 sm:px-8 sm:py-20">
      <Reveal>
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-12">
          <div className="flex items-baseline gap-4">
            {kicker && <span className="label text-brand">{kicker}</span>}
            <h2 className="num text-4xl uppercase sm:text-6xl">{title}</h2>
          </div>
          {aside}
        </header>
      </Reveal>
      {children}
    </section>
  );
}
