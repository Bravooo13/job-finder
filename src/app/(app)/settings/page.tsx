import { PageHeader } from "@/components/layout/PageHeader";
import { AboutMeCard } from "@/components/settings/AboutMeCard";
import { AgentPromptsCard } from "@/components/settings/AgentPromptsCard";
import { AiSettingsCard } from "@/components/settings/AiSettingsCard";
import { LatexEngineCard } from "@/components/settings/LatexEngineCard";
import { getAboutMe, getAiStatus, getCustomPrompts } from "@/lib/ai/settings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [status, aboutMe, prompts] = await Promise.all([getAiStatus(), getAboutMe(), getCustomPrompts()]);
  return (
    <>
      <PageHeader title="Settings" description="AI model, notes about you, agent instructions and the LaTeX engine." />
      <div className="grid max-w-4xl gap-6">
        <AiSettingsCard initial={status} />
        <AboutMeCard initial={aboutMe} />
        <AgentPromptsCard custom={prompts} />
        <LatexEngineCard />
      </div>
    </>
  );
}
