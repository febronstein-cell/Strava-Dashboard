import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/** Moldura padrão de cada seção: largura, espaçamento e cabeçalho. */
export function SectionShell({
  id,
  index,
  title,
  aside,
  children,
}: {
  id: string;
  index: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <Reveal>
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-12">
          <div className="flex items-baseline gap-4">
            <span className="label">{index}</span>
            <h2 className="num text-4xl uppercase sm:text-6xl">{title}</h2>
          </div>
          {aside}
        </header>
      </Reveal>
      {children}
    </section>
  );
}
