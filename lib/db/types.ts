import type { db } from "@/lib/db";

export type MigratorFn = (client: typeof db) => Promise<void>;
