import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as office from "@/lib/office";
import { officePosition } from "@/lib/db/schema";
import { type Permissions } from "@/lib/db/permissions";
import { oneOf, Success } from "@/lib/one-of";
import { user } from "@/lib/db/schema";
import * as utils from "@/scripts/utils.mjs";

// ── Names pool ──────────────────────────────────────────────────────────────

const GIVEN_NAMES = [
  "Marco", "Liza", "Juan", "Ana", "Jose", "Maria", "Pedro", "Elena",
  "Miguel", "Sofia", "Antonio", "Carmen", "Francisco", "Rosa", "Diego",
  "Isabella", "Luis", "Valentina", "Rafael", "Lucia",
];

const SURNAMES = [
  "Santos", "Reyes", "Cruz", "Garcia", "Mendoza", "Torres", "Flores",
  "Ramos", "Bautista", "Villanueva", "Aquino", "Castillo", "Gonzales",
  "Diaz", "Morales", "Alvarez", "Romero", "Santiago", "Silva", "Reyes",
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomName(): string {
  return `${randomChoice(GIVEN_NAMES)} ${randomChoice(SURNAMES)}`;
}

function emailFromName(name: string): string {
  const [first, last] = name.toLowerCase().split(" ");
  return `${first}.${last}@setup.local`;
}

//(use same password for all accounts for convenience heehee)
const PASSWORD = utils.token.generatePassword(16);

// ── Helper: create account ──────────────────────────────────────────────────

async function createAccount(params: {
  name: string;
  officeId: string;
  positionId: string;
  email: string;
  enabled?: boolean;
}) {
  const { name, officeId, positionId, email, enabled = true } = params;

  // Check if an account with this email already exists — skip if so
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing) {
    console.log(`  Account already exists: ${name} (${email}) -> ${existing.id}`);
    return { id: existing.id, email, name };
  }

  const newUser = await auth.api.signUpEmail({
    body: {
      name,
      email,
      password: PASSWORD,
      officeId,
      officePositionId: positionId,
    },
  });

  if (enabled) {
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, newUser.user.id));
  }

  return { id: newUser.user.id, email, name };
}

// ── Helper: create role ─────────────────────────────────────────────────────

async function createRole(params: {
  officeId: string;
  name: string;
  permissions: Permissions[];
}) {
  const { officeId, name, permissions } = params;
  // Check if the role already exists under this office
  const [existingRole] = await db
    .select({ id: officePosition.id })
    .from(officePosition)
    .where(
      and(
        eq(officePosition.officeId, officeId),
        eq(officePosition.name, name),
      ),
    )
    .limit(1);

  if (existingRole) {
    console.log(`  Role already exists: ${name} -> ${existingRole.id}`);
    return new Success({
      id: existingRole.id,
      name,
      permissions,
    });
  }

  const result = await office.addRole(officeId, name, permissions);
  return result;
}

// ── Flow ────────────────────────────────────────────────────────────────────

async function run() {
  // ── Step 1: Create offices ───────────────────────────────────────────────
  console.log("");
  console.log("=== Creating offices ===");

  let budgetOfficeId = "";
  let mayorOfficeId = "";

  {
    // We need the schema `office` table, not the `office` module.
    // Import it inline to avoid shadowing `import * as office from "@/lib/office"`.
    const { office: officeTable } = await import("@/lib/db/schema");
    const [existing] = await db.select({ id: officeTable.id }).from(officeTable).where(eq(officeTable.name, "MUNICIPAL BUDGET OFFICE")).limit(1);
    if (existing) {
      budgetOfficeId = existing.id;
      console.log(`  MUNICIPAL BUDGET OFFICE  -> exists, ID: ${existing.id}`);
    } else {
      const result = await office.createOffice("MUNICIPAL BUDGET OFFICE");
      oneOf(result).match(
        (s) => {
          budgetOfficeId = s.id;
          console.log(`  MUNICIPAL BUDGET OFFICE  -> created, ID: ${s.id}`);
        },
        (e) => {
          console.error("  Failed to create MUNICIPAL BUDGET OFFICE");
          console.error(`    ${e.type}: ${e.message}`);
          process.exit(1);
        },
      );
    }
  }

  {
    const { office: officeTable } = await import("@/lib/db/schema");
    const [existing] = await db.select({ id: officeTable.id }).from(officeTable).where(eq(officeTable.name, "Mayor's Office")).limit(1);
    if (existing) {
      mayorOfficeId = existing.id;
      console.log(`  Mayor's Office            -> exists, ID: ${existing.id}`);
    } else {
      const result = await office.createOffice("Mayor's Office");
      oneOf(result).match(
        (s) => {
          mayorOfficeId = s.id;
          console.log(`  Mayor's Office            -> created, ID: ${s.id}`);
        },
        (e) => {
          console.error("  Failed to create Mayor's Office");
          console.error(`    ${e.type}: ${e.message}`);
          process.exit(1);
        },
      );
    }
  }

  // ── Step 2: Create roles ─────────────────────────────────────────────────
  console.log("");
  console.log("=== Creating roles ===");

  type RoleDef = {
    officeId: string;
    name: string;
    permissions: Permissions[];
  };

  const roleDefs: RoleDef[] = [
    // MUNICIPAL BUDGET OFFICE
    {
      officeId: budgetOfficeId,
      name: "Municipal Treasurer",
      permissions: ["obr.disbursement.treasurer.approve" satisfies Permissions],
    },
    {
      officeId: budgetOfficeId,
      name: "Municipal Accountant",
      permissions: ["obr.disbursement.accountant.approve" satisfies Permissions],
    },
    {
      officeId: budgetOfficeId,
      name: "Budget Officer",
      permissions: [
        "obr.management.write" satisfies Permissions,
        "obr.management.read" satisfies Permissions,
        "obr.approver.basic.high.write" satisfies Permissions,
        "esre.read" satisfies Permissions,
        "esre.write" satisfies Permissions,
        "supplemental.read" satisfies Permissions,
        "supplemental.write" satisfies Permissions,
        "lbac.data.read" satisfies Permissions,
        "lbac.data.write" satisfies Permissions,
        "aip.read" satisfies Permissions,
        "aip.write" satisfies Permissions,
        "saaob.data.read" satisfies Permissions,
        "saaob.data.write" satisfies Permissions,
        "data-types.manage.read" satisfies Permissions,
        "data-types.manage.write" satisfies Permissions,
        "travel.approver" satisfies Permissions,
      ],
    },
    // Mayor's Office
    {
      officeId: mayorOfficeId,
      name: "Mayor",
      permissions: ["obr.disbursement.mayor.approve" satisfies Permissions],
    },
    {
      officeId: mayorOfficeId,
      name: "Vice Mayor",
      permissions: [
        "obr.approver.advanced.write" satisfies Permissions,
        "obr.approver.advanced.read" satisfies Permissions,
      ],
    },
    {
      officeId: mayorOfficeId,
      name: "Head",
      permissions: [
        "office.head" satisfies Permissions,
        "obr.request.create" satisfies Permissions,
        "obr.request.read" satisfies Permissions,
        "obr.approver.basic.write" satisfies Permissions,
        "obr.approver.basic.read" satisfies Permissions,
        "obr.disbursement.create" satisfies Permissions,
        "saaob.office.read" satisfies Permissions,
        "purchasing.request.create" satisfies Permissions,
        "purchasing.request.manage" satisfies Permissions,
        "ppmp.read" satisfies Permissions,
        "ppmp.manage" satisfies Permissions,
        "travel.read" satisfies Permissions,
        "travel.write" satisfies Permissions,
        "lbac.office.read" satisfies Permissions,
        "lbac.office.write" satisfies Permissions,
      ],
    },
  ];

  const createdRoles: Array<{ name: string; officeId: string; id: string }> = [];

  for (const def of roleDefs) {
    const officeLabel = def.officeId === budgetOfficeId ? "MUNICIPAL BUDGET OFFICE" : "Mayor's Office";
    const result = await createRole(def);
    oneOf(result).match(
      (s) => {
        console.log(`  ${def.name.padEnd(28)} (${officeLabel})  -> Role ID: ${s.id}`);
        createdRoles.push({ name: def.name, officeId: def.officeId, id: s.id });
      },
      (e) => {
        console.error(`  Failed to create role: ${def.name}`);
        console.error(`    ${e.type}: ${e.message}`);
        process.exit(1);
      },
    );
  }

  // ── Step 3: Create accounts ──────────────────────────────────────────────
  console.log("");
  console.log("=== Creating accounts ===");

  const createdAccounts: Array<{ name: string; email: string; id: string }> = [];

  for (const role of createdRoles) {
    const accountName = randomName();
    const accountEmail = emailFromName(accountName);

    const result = await createAccount({
      name: accountName,
      officeId: role.officeId,
      positionId: role.id,
      email: accountEmail,
      enabled: true,
    });

    console.log(`  ${role.name.padEnd(28)}  -> User ID: ${result.id}`);
    console.log(`    Name:     ${accountName}`);
    console.log(`    Email:    ${accountEmail}`);
    console.log(`    Password: ${PASSWORD}`);
    createdAccounts.push(result);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("");
  console.log("=== Summary ===");
  console.log("  Offices created:  2");
  console.log(`  Roles created:    ${createdRoles.length}`);
  console.log(`  Accounts created: ${createdAccounts.length}`);
  console.log("");
  console.log("  All accounts were created with a randomly generated password.");
  console.log("  Password is displayed above; use the forgot-password flow in production.");
  console.log("");
}

run().catch(console.error);
