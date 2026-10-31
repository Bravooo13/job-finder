import { IdCard } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
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
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <IdCard className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Your information for applications</p>
                <p className="text-sm text-muted-foreground">Email, phone, address, date of birth, education, work authorization and your own answers.</p>
              </div>
            </div>
            <Link href="/me" className="shrink-0 text-sm font-medium text-primary hover:underline">
              Open My info
            </Link>
          </CardContent>
        </Card>
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
