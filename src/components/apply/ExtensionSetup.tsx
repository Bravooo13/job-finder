import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  { title: "Open Chrome's extensions page", body: "Type chrome://extensions in the address bar and press Return." },
  { title: "Turn on Developer mode", body: "It's the switch in the top-right corner of that page." },
  {
    title: "Load the helper",
    body: "Click “Load unpacked” and choose the extension folder inside Job Finder (Desktop › Job-Finder › extension).",
  },
  { title: "Pin it", body: "Click the puzzle-piece icon in Chrome's toolbar and pin “Job Finder Helper”." },
  { title: "Keep Job Finder running", body: "The helper sends everything to Job Finder on this Mac (http://localhost:3737)." },
];

export function ExtensionSetup() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Install the Job Finder Helper (Chrome)</CardTitle>
          <CardDescription>A small extension that lives in this project. It only talks to Job Finder on this computer.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                <span>
                  <span className="block font-medium">{s.title}</span>
                  <span className="block text-sm text-muted-foreground">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>What it does</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p>
            <b>LinkedIn and Handshake:</b> a Job Finder panel appears on job search pages. “Grab jobs on this page” reads each
            job (with a short pause between them) and sends it to Found jobs, with its industry, visa wording and the
            company&apos;s own application link. Company job boards behind those links are added to your searches.
          </p>
          <p>
            <b>Any careers page:</b> click the toolbar icon and “Grab jobs from this page”. Job Finder reads the page&apos;s job
            data, or learns the company&apos;s job board, or asks the AI to list the openings.
          </p>
          <p>
            <b>Applications</b> (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, or any form): “Fill this application”
            answers from <i>My answers</i>, attaches your resume PDF and cover letter, and colors each field: green from your
            answers, yellow to check, red needs you. “Write answers with AI” drafts the open questions. You review and press
            Submit yourself, then “I submitted it” marks the job applied.
          </p>
          <p className="text-muted-foreground">
            LinkedIn&apos;s terms don&apos;t allow automated collection, so the helper only reads pages you open, one job at a time,
            at a human pace. Use it for your own job search.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
