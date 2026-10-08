import { siteConfig } from "@/site.config";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

/** ESPAÇO RESERVADO: "sobre mim". O texto vem de `siteConfig.about`. */
export function About() {
  const { title, body } = siteConfig.about;
  return (
    <SectionShell id="sobre" index="06" title={title}>
      <Reveal>
        <p className="max-w-2xl text-xl leading-relaxed text-muted">
          {body || "Escreva aqui a sua história no triathlon (siteConfig.about.body)."}
        </p>
      </Reveal>
    </SectionShell>
  );
}
