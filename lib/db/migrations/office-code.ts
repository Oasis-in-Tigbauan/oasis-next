import fs from 'fs/promises';
import path from 'path';

import {count} from 'drizzle-orm';

import {officeCodes} from '@/lib/db/schema';
import type {MigratorFn} from '@/lib/db/types';

export const officeCodesMigration: MigratorFn = async (client, usr): Promise<void> => {
  console.log('Migrating Office Codes...');

  // Check if there are items. Skip if there are items.
  const [result] = await client.select({count: count(officeCodes.id)}).from(officeCodes);
  if (Number(result.count) > 0) {
    console.log('-> Skipped due to office codes exists');
    return;
  }

  // Create migrations
  const codes = await read();
  await client.insert(officeCodes).values(
    codes.map((c) => ({
      aa: c['aa'],
      code: c['code'],
      sector: c['sector'],
      function: c['function'],
      liftOffice: c['lift_office'],
      subOffice: c['sub_office'],
      officeId: usr.oId,
      headUserId: usr.id,
    })),
  );
};

async function read(): Promise<Record<string, string>[]> {
  const filePath = path.join(__dirname, './data/office-codes.tsv');
  const file = await fs.readFile(filePath, 'utf8');

  const lines = file.split(/\r?\n/).map((x) => x.split('\t'));

  const projected: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const obj: Record<string, string> = {};
    obj['identifierId'] = lines[i][0];
    obj['aa'] = lines[i][1];
    obj['code'] = lines[i][2];
    obj['sector'] = lines[i][4];
    obj['function'] = lines[i][5];
    obj['lift_office'] = lines[i][6];
    obj['sub_office'] = lines[i][7];
    obj['office'] = lines[i][8];

    projected.push(obj);
  }

  return projected;
}
