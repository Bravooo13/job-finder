import "server-only";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiMessages, aiThreads } from "@/lib/db/schema";

export interface ThreadScope {
  agent?: string;
  resumeId?: string;
  jobId?: string;
  coverLetterId?: string;
}

export async function listThreads(scope: ThreadScope, limit = 30) {
  const where: SQL[] = [];
  if (scope.agent) where.push(eq(aiThreads.agent, scope.agent));
  if (scope.resumeId) where.push(eq(aiThreads.resumeId, scope.resumeId));
  if (scope.jobId) where.push(eq(aiThreads.jobId, scope.jobId));
  if (scope.coverLetterId) where.push(eq(aiThreads.coverLetterId, scope.coverLetterId));
  return db
    .select({
      id: aiThreads.id,
      agent: aiThreads.agent,
      title: aiThreads.title,
      resumeId: aiThreads.resumeId,
      jobId: aiThreads.jobId,
      coverLetterId: aiThreads.coverLetterId,
      updatedAt: aiThreads.updatedAt,
    })
    .from(aiThreads)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(aiThreads.updatedAt))
    .limit(limit);
}

export type ThreadListItem = Awaited<ReturnType<typeof listThreads>>[number];

export async function getThreadMessages(threadId: string) {
  return db
    .select({ id: aiMessages.id, role: aiMessages.role, content: aiMessages.content, createdAt: aiMessages.createdAt })
    .from(aiMessages)
    .where(eq(aiMessages.threadId, threadId))
    .orderBy(asc(aiMessages.createdAt));
}
