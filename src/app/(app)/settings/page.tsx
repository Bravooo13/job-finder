import { PageHeader } from "@/components/layout/PageHeader";
import { AboutMeCard } from "@/components/settings/AboutMeCard";
import { AgentPromptsCard } from "@/components/settings/AgentPromptsCard";
import { AiSettingsCard } from "@/components/settings/AiSettingsCard";
import { H1bDataCard } from "@/components/settings/H1bDataCard";
import { LatexEngineCard } from "@/components/settings/LatexEngineCard";
import { getAboutMe, getAiStatus, getCustomPrompts } from "@/lib/ai/settings";
import { h1bStats } from "@/lib/classify/store";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [status, aboutMe, prompts, h1b] = await Promise.all([getAiStatus(), getAboutMe(), getCustomPrompts(), h1bStats()]);
  return (
    <>
      <PageHeader title="Settings" description="AI model, notes about you, agent instructions, H-1B data and the LaTeX engine." />
      <div className="grid max-w-4xl gap-6">
        <AiSettingsCard initial={status} />
        <AboutMeCard initial={aboutMe} />
        <AgentPromptsCard custom={prompts} />
        <H1bDataCard initial={h1b} />
        <LatexEngineCard />
      </div>
    </>
  );
}
