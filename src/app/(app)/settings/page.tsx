import { PageHeader } from "@/components/layout/PageHeader";
import { AboutMeCard } from "@/components/settings/AboutMeCard";
import { AgentPromptsCard } from "@/components/settings/AgentPromptsCard";
import { AiPermissionsCard } from "@/components/settings/AiPermissionsCard";
import { AiSettingsCard } from "@/components/settings/AiSettingsCard";
import { H1bDataCard } from "@/components/settings/H1bDataCard";
import { LatexEngineCard } from "@/components/settings/LatexEngineCard";
import { getAboutMe, getAiStatus, getCustomPrompts } from "@/lib/ai/settings";
import { h1bStats } from "@/lib/classify/store";
import { spentToday } from "@/lib/control/log";
import { permissionsView } from "@/lib/control/run";
import { getControlSettings } from "@/lib/control/settings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [status, aboutMe, prompts, h1b, groups, control, spent] = await Promise.all([
    getAiStatus(),
    getAboutMe(),
    getCustomPrompts(),
    h1bStats(),
    permissionsView(),
    getControlSettings(),
    spentToday(),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="AI model, what AI may do, notes about you, agent instructions, H-1B data and the LaTeX engine." />
      <div className="grid max-w-4xl gap-6">
        <AiSettingsCard initial={status} />
        <AiPermissionsCard groups={groups} overrides={control.actions} dailyCapUsd={control.dailyCapUsd} spentToday={spent} />
        <AboutMeCard initial={aboutMe} />
        <AgentPromptsCard custom={prompts} />
        <H1bDataCard initial={h1b} />
        <LatexEngineCard />
      </div>
    </>
  );
}
