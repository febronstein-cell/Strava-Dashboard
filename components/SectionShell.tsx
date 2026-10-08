import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/** Standard frame of each section: width, spacing, header and a one-line description. */
export function SectionShell({
  id,
  title,
  kicker,
  description,
  aside,
  children,
}: {
  id: string;
  title: string;
  /** small text next to the title (e.g. the period shown) */
  kicker?: string;
  /** one line saying what the section shows (and which time basis it uses) */
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-32 px-5 py-14 sm:scroll-mt-28 sm:px-8 sm:py-20">
      <Reveal>
        <header className="mb-8 sm:mb-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-baseline gap-4">
              {kicker && <span className="label text-brand">{kicker}</span>}
              <h2 className="num text-4xl uppercase sm:text-6xl">{title}</h2>
            </div>
            {aside}
          </div>
          {description && <p className="mt-3 max-w-3xl text-muted">{description}</p>}
        </header>
      </Reveal>
      {children}
    </section>
  );
}
