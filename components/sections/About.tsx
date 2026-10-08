"use client";

import { siteConfig } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

/** "About me". The text comes from `siteConfig.about` (one paragraph per blank line). */
export function About() {
  const { t } = useI18n();
  const { title, body, places } = siteConfig.about;
  const paragraphs = body.split(/\n\s*\n/).filter(Boolean);
  return (
    <SectionShell id="about" title={t(title)}>
      <Reveal>
        <div className="max-w-2xl space-y-5 text-xl leading-relaxed text-muted">
          {paragraphs.length ? (
            paragraphs.map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p>{t("Write your triathlon story here (siteConfig.about.body).")}</p>
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
