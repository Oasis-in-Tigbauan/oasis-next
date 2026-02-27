import type { MigratorFn } from "@/lib/db/types";
import * as permissions from "@/lib/db/permissions";
import * as schema from "@/lib/db/schema";

export const roleMigration: MigratorFn = async (client): Promise<void> => {
  console.log("Migrating Offices, Positions and Roles...");

  // Offices to seed
  const offices = [
    {
      name: "Cardinal Administrators",
      prohibited: true,
      positions: [
        {
          name: "Heathcliff",
          permissions: [
            permissions.APPROVALS_HEAD_READ,
            permissions.APPROVALS_HEAD_WRITE,
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
            permissions.APPROVALS_HEAD_READ,
            permissions.APPROVALS_HEAD_WRITE,
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
            permissions.APPROVALS_HEAD_READ,
            permissions.APPROVALS_HEAD_WRITE,
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
