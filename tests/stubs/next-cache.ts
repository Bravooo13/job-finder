// Outside Next.js there's no page cache to refresh; the unit tests use this instead of next/cache.
export function revalidatePath(): void {}
export function revalidateTag(): void {}
