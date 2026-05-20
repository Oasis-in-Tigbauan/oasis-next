import type { db } from "@/lib/db";

export type MigratorFn = (client: typeof db, usr: MigratorUser) => Promise<void>;

type MigratorUser = {
  id: string;
  oId: string;
  rId: string;
}
