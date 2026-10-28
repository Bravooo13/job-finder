import { ExternalLink } from "lucide-react";
import { AddCompany } from "@/components/companies/AddCompany";
import { RemoveCompanyButton } from "@/components/companies/RemoveCompanyButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROVIDER_LABELS, PROVIDERS, type Provider } from "@/lib/boards/types";
import { getDirectoryCounts, listCompanyBoards } from "@/lib/search/queries";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const [boards, counts] = await Promise.all([listCompanyBoards(), Promise.resolve(getDirectoryCounts())]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Companies"
        description="Searches check every company here. Add the employers you care about that aren't in the built-in list."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Add a company</CardTitle>
            </CardHeader>
            <CardContent>
              <AddCompany />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your companies ({boards.length})</CardTitle>
              <CardDescription>Included in every search, and the only ones checked by searches set to “Only your companies”.</CardDescription>
            </CardHeader>
            <CardContent>
              {boards.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Board</TableHead>
                      <TableHead className="text-right">Open jobs</TableHead>
                      <TableHead className="hidden sm:table-cell">Added</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boards.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          {b.careersUrl ? (
                            <a href={b.careersUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                              {b.name} <ExternalLink className="size-3 text-muted-foreground" />
                            </a>
                          ) : (
                            b.name
                          )}
                        </TableCell>
                        <TableCell>{PROVIDER_LABELS[b.provider as Provider]}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.jobCount?.toLocaleString() ?? "—"}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(b.createdAt)}</TableCell>
                        <TableCell>
                          <RemoveCompanyButton id={b.id} name={b.name} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">None yet. Big employers on Workday (banks, consulting, large tech) need to be added here.</p>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Built-in list</CardTitle>
            <CardDescription>{total.toLocaleString()} company job boards, mostly tech and startups.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {PROVIDERS.map((p) => (
                <li key={p} className="flex justify-between">
                  <span>{PROVIDER_LABELS[p]}</span>
                  <span className="tabular-nums text-muted-foreground">{(counts[p] ?? 0).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
