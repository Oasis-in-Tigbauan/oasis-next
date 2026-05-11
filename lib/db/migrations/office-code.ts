import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

import type { MigratorFn } from "@/lib/db/types";
import { officeCodes, officePosition, user } from "@/lib/db/schema";

export const officeCodesMigration: MigratorFn = async (client): Promise<void> => {
  console.log("Migrating Office Codes...");

  // Get the heathcliff user
  const [heathcliffRole] = await client
    .select({
      id: officePosition.id,
    })
    .from(officePosition)
    .where(eq(officePosition.name, "Heathcliff"));
  if (!heathcliffRole) {
    throw new Error("System Role cannot be found. This may be an error.");
  }

  const [systemUser] = await client
    .select({
      id: user.id,
      officeId: user.officeId,
    })
    .from(user)
    .where(eq(user.officePositionId, heathcliffRole.id))
    .limit(1);
  if (!systemUser) {
    throw new Error("System User cannot be found. This may be an error.");
  }

  // Create migrations
  const codes = await read();
  await client
    .insert(officeCodes)
    .values(codes.map(c => ({
      aa: c["aa"],
      code: c["code"],
      sector: c["sector"],
      function: c["function"],
      liftOffice: c["lift_office"],
      subOffice: c["sub_office"],
      officeId: systemUser.officeId,
      headUserId: systemUser.id,
    })));
};

async function read(): Promise<Record<string, string>[]> {
  const filePath = path.join(__dirname, "./data/office-codes.tsv");
  const file = await fs.readFile(filePath, "utf8");

  const lines = file.split(/\r?\n/).map(x => x.split("\t"));

  const projected: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const obj: Record<string, string> = {};
    obj["identifierId"] = lines[i][0];
    obj["aa"] = lines[i][1];
    obj["code"] = lines[i][2];
    obj["sector"] = lines[i][4];
    obj["function"] = lines[i][5];
    obj["lift_office"] = lines[i][6];
    obj["sub_office"] = lines[i][7];
    obj["office"] = lines[i][8];

    projected.push(obj);
  }

  return projected;
}
