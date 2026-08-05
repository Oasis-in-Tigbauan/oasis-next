import 'dotenv/config';
import {and, eq} from 'drizzle-orm';

import {auth} from '@/lib/auth';
import {db} from '@/lib/db';
import {migrations} from '@/lib/db/migrations';
import {office, officePosition, user} from '@/lib/db/schema';
import * as utils from '@/scripts/utils.mjs';

async function migrate() {
  // Create office and roles first
  const {oId, rId} = await checkOrCreateDefaultRole();

  // Create an user
  let [defaultUser] = await db
    .select({
      id: user.id,
      enabled: user.emailVerified,
    })
    .from(user)
    .where(and(eq(user.officeId, oId), eq(user.officePositionId, rId)));

  if (!defaultUser) {
    console.log('Creating account...');
    const password = utils.token.generatePassword(16);

    const admin = await auth.api.signUpEmail({
      body: {
        name: 'default user',
        email: 'default@laboratories-internal.local',
        password,
        officeId: oId,
        officePositionId: rId,
      },
    });

    defaultUser = {
      id: admin.user.id,
      enabled: false,
    };
  }

  // Apply migrations
  for (const migration of migrations) {
    await migration(db, {
      id: defaultUser.id,
      oId,
      rId,
    });
  }

  console.log('Migrations completed.');
}

async function checkOrCreateDefaultRole() {
  // Create or get the office first.
  let [enrollerOffice] = await db
    .select({id: office.id})
    .from(office)
    .where(eq(office.name, 'Cardinal Administrators'));
  if (!enrollerOffice) {
    [enrollerOffice] = await db
      .insert(office)
      .values({
        name: 'Cardinal Administrators',
        prohibitedAssignment: true,
      })
      .returning();
  }

  let [defaultAccountRole] = await db
    .select({id: officePosition.id})
    .from(officePosition)
    .where(
      and(
        eq(officePosition.name, 'Default Users Group'),
        eq(officePosition.officeId, enrollerOffice.id),
      ),
    );
  if (!defaultAccountRole) {
    [defaultAccountRole] = await db
      .insert(officePosition)
      .values({
        name: 'Default Users Group',
        officeId: enrollerOffice.id,
        permissions: [],
      })
      .returning();
  }

  return {oId: enrollerOffice.id, rId: defaultAccountRole.id};
}

migrate().catch(console.error);
