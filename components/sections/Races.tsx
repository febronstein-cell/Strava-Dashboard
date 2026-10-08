import { siteConfig } from "@/site.config";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

/** ESPAÇO RESERVADO: calendário de provas. Os itens vêm de `siteConfig.races`. */
export function Races() {
  const races = siteConfig.races;
  return (
    <SectionShell id="provas" index="06" title="Provas">
      <Reveal>
        {races.length === 0 ? (
          <div className="card border-dashed p-8 text-muted">
            Adicione provas em <code>siteConfig.races</code> (nome, data, distância, nota).
          </div>
        ) : (
          <ul className="card divide-y divide-line">
            {races.map((r) => (
              <li key={r.name + r.date} className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-4">
                <span className="num text-3xl uppercase">{r.name}</span>
                <span className="label">
                  {r.date}
                  {r.distance ? ` · ${r.distance}` : ""}
                </span>
                {r.note && <p className="w-full text-sm text-muted">{r.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </SectionShell>
  );
}
