import { count } from "drizzle-orm";

import type { MigratorFn } from "@/lib/db/types";
import * as permissions from "@/lib/db/permissions";
import * as schema from "@/lib/db/schema";

export const roleMigration: MigratorFn = async (client): Promise<void> => {
  console.log("Migrating Offices, Positions and Roles...");

  // Check if there are items. Skip if there are items.
  const [result] = await client
    .select({ count: count(schema.office.id)})
    .from(schema.office);
  if (Number(result.count) > 0) {
    console.log("-> Skipped due to offices and roles exists.");
    return;
  }

  // Offices to seed
  const offices = [
    {
      name: "Cardinal Administrators",
      prohibited: true,
      positions: [
        {
          name: "Heathcliff",
          permissions: [
            permissions.APPROVALS_ACCOUNT_READ,
            permissions.APPROVALS_ACCOUNT_WRITE,
            permissions.APPROVALS_INVITATION_READ,
            permissions.APPROVALS_INVITATION_WRITE,
          ],
        },
      ],
    },
    {
      name: "Office of the Mayor",
      prohibited: false,
      positions: [
        {
          name: "Mayor",
          permissions: [],
        },
        {
          name: "Vice Mayor",
          permissions: [
            permissions.OBR_APPROVER_ADVANCED_WRITE,
            permissions.OBR_APPROVER_ADVANCED_READ,
          ],
        },
      ],
    },
    {
      name: "Municipal Budget Office",
      prohibited: false,
      positions: [
        {
          name: "Budget Officer",
          permissions: [
            permissions.APPROVALS_ACCOUNT_READ,
            permissions.APPROVALS_ACCOUNT_WRITE,
            permissions.OBR_APPROVER_BASIC_HIGH_WRITE,
            permissions.OBR_MANAGEMENT_READ,
            permissions.OBR_MANAGEMENT_WRITE,
            permissions.ESRE_READ,
            permissions.ESRE_WRITE,
            permissions.SUPPLEMENTAL_READ,
            permissions.SUPPLEMENTAL_WRITE,
            permissions.LBAC_DATA_READ,
            permissions.LBAC_DATA_WRITE,
            permissions.AIP_READ,
            permissions.AIP_WRITE,
          ],
        },
      ],
    },
  ];

  for (const office of offices) {
    // Create the office first
    const [createdOffice] = await client
      .insert(schema.office).values({
        name: office.name,
        prohibitedAssignment: office.prohibited,
      })
      .returning({
        insertedOfficeId: schema.office.id,
      });

    // Once the office is created, we can create positions for these too.
    for (const position of office.positions) {
      await client.insert(schema.officePosition).values({
        name: position.name,
        permissions: position.permissions,
        officeId: createdOffice.insertedOfficeId,
      });
    }
  }
};
