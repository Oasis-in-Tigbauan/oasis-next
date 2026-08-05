import {count} from 'drizzle-orm';

import * as schema from '@/lib/db/schema';
import type {MigratorFn} from '@/lib/db/types';

export const fundTypesMigration: MigratorFn = async (client): Promise<void> => {
  console.log('Migrating Fund Types...');

  // Check if there are items. Skip if there are items.
  const [result] = await client.select({count: count(schema.fundTypes.id)}).from(schema.fundTypes);
  if (Number(result.count) > 0) {
    console.log('-> Skipped due to fund types exists.');
    return;
  }

  const fundTypesToSeed = ['GENERAL FUND', 'TRUST FUND', 'SEF'];

  await client.insert(schema.fundTypes).values(
    fundTypesToSeed.map((x) => ({
      name: x,
    })),
  );
};
