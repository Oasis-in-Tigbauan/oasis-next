import {aipMigration} from '@/lib/db/migrations/aip';
import {aroMigration} from '@/lib/db/migrations/aro';
import {expenseCodesMigration} from '@/lib/db/migrations/expense-codes';
import {expenseTypesMigration} from '@/lib/db/migrations/expense-type';
import {fundTypesMigration} from '@/lib/db/migrations/fund-types';
import {lbacMigration} from '@/lib/db/migrations/lbac';
import {lbacF6Migration} from '@/lib/db/migrations/lbac-f6';
import {obrEntriesMigration} from '@/lib/db/migrations/obr';
import {officeCodesMigration} from '@/lib/db/migrations/office-code';
import {procurementTypesMigration} from '@/lib/db/migrations/procurement-types';
import {saaobEntriesMigration} from '@/lib/db/migrations/saaob';
import {supplementalMigration} from '@/lib/db/migrations/supplemental';
import {MigratorFn} from '@/lib/db/types';

const migrations: MigratorFn[] = [
  aipMigration,
  aroMigration,
  officeCodesMigration,
  expenseCodesMigration,
  fundTypesMigration,
  saaobEntriesMigration,
  lbacMigration,
  lbacF6Migration,
  supplementalMigration,
  obrEntriesMigration,
  procurementTypesMigration,
  expenseTypesMigration,
];

export {migrations};
