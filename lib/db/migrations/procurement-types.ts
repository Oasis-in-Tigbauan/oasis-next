import {count} from 'drizzle-orm';

import * as schema from '@/lib/db/schema';
import type {MigratorFn} from '@/lib/db/types';

export const procurementTypesMigration: MigratorFn = async (client): Promise<void> => {
  console.log('Migrating Procurement Types...');

  // Check if there are items. Skip if there are items.
  const [result] = await client
    .select({count: count(schema.modeOfProcurements.id)})
    .from(schema.modeOfProcurements);
  if (Number(result.count) > 0) {
    console.log('-> Skipped due to procurement types exists.');
    return;
  }

  const procurementTypesToSeed = [
    'COMP. BIDDING',
    'LSB',
    'DC',
    'RO',
    'SHOP',
    'NEG',
    'SVP',
    'TWO FAILED BIDDINGS',
    'EMERGENCY CASES',
    'TAKE OVER OF CONTRACTS',
    'Adjacent or Contiguous',
    'Agency to Agency',
    'Scientific',
    'Scholarly or Artistic Work',
    'Exclusive Technology and Media Services',
    'Highly Technical Consultants',
    'Defense Cooperation Agreement',
    'Lease of Real Property and Venue',
    'NGO Participation',
    'Community Participation',
    'OTHER',
    'Delegation of Authority',
  ];

  await client.insert(schema.modeOfProcurements).values(
    procurementTypesToSeed.map((x) => ({
      name: x,
    })),
  );
};
