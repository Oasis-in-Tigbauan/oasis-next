import {count} from 'drizzle-orm';

import {lbacItems, lbacMonitoring} from '@/lib/db/schema';
import type {MigratorFn} from '@/lib/db/types';

export const lbacF6Migration: MigratorFn = async (client): Promise<void> => {
  console.log('Migrating LBAC F6 entries...');

  const [result] = await client.select({count: count(lbacMonitoring.id)}).from(lbacMonitoring);
  if (Number(result.count) > 0) {
    console.log('-> Skipped due to LBAC F6 entries already exist.');
    return;
  }

  // Load all lbacItems — one lbacMonitoring row per item
  const allItems = await client
    .select({id: lbacItems.id, aipRefCode: lbacItems.aipRefCode})
    .from(lbacItems);

  const values = allItems.map((item) => {
    return {
      itemId: item.id,
    };
  });

  if (values.length > 0) {
    await client.insert(lbacMonitoring).values(values);
  }
  console.log(`-> Inserted ${values.length} LBAC F6 entries.`);
};
