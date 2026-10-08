import { siteConfig } from "@/site.config";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

/** "Sobre mim". O texto vem de `siteConfig.about` (um parágrafo por linha em branco). */
export function About() {
  const { title, body, places } = siteConfig.about;
  const paragraphs = body.split(/\n\s*\n/).filter(Boolean);
  return (
    <SectionShell id="about" title={title}>
      <Reveal>
        <div className="max-w-2xl space-y-5 text-xl leading-relaxed text-muted">
          {paragraphs.length ? (
            paragraphs.map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p>Escreva aqui a sua história no triathlon (siteConfig.about.body).</p>
          )}
        </div>
        <p className="label mt-8">
          {siteConfig.madeBy}
          {places ? ` · ${places}` : ""}
        </p>
      </Reveal>
    </SectionShell>
  );
}
