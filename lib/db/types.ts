import type { db } from ".";

export type MigratorFn = (client: typeof db) => Promise<void>;
