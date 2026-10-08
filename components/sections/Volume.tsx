import type { DashboardContext } from "@/lib/dashboard";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { VolumeChart } from "@/components/VolumeChart";

export function Volume({ ctx }: { ctx: DashboardContext }) {
  return (
    <SectionShell id="volume" index="02" title="Volume">
      <Reveal>
        <VolumeChart weekly={ctx.weekly} monthly={ctx.monthly} />
      </Reveal>
    </SectionShell>
  );
}
