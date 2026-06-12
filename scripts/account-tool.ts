import "dotenv/config";

import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generatePassword } from "@/lib/generators/password-generator";
import * as office from "@/lib/office";
import { type Permissions } from "@/lib/db/permissions";
import * as validators from "@/lib/validators/utilities";
import { oneOf } from "@/lib/one-of";
import { user } from "@/lib/db/schema";

// Random name generation
const firstNames = [
  "Alexander", "Dmitry", "Sergei", "Andrei", "Alexei", "Ivan", "Mikhail",
  "Nikolai", "Vladimir", "Pavel", "Boris", "Yuri", "Oleg", "Igor", "Maxim",
  "Anton", "Denis", "Evgeny", "Konstantin", "Leonid", "Viktor", "Roman",
  "Elena", "Olga", "Natalia", "Irina", "Tatiana", "Svetlana", "Anastasia",
  "Maria", "Ekaterina", "Anna", "Yulia", "Daria", "Oksana", "Marina",
  "Galina", "Valentina", "Ludmila", "Nadezhda", "Vera", "Polina", "Sofia",
];

const lastNames = [
  "Ivanov", "Smirnov", "Kuznetsov", "Popov", "Vasiliev", "Petrov", "Sokolov",
  "Mikhailov", "Fedorov", "Morozov", "Volkov", "Alexeev", "Lebedev", "Semenov",
  "Egorov", "Pavlov", "Kozlov", "Stepanov", "Nikolaev", "Orlov", "Andreev",
  "Makarov", "Nikitin", "Zakharov", "Zaitsev", "Soloviev", "Borisov", "Yakovlev",
  "Grigoriev", "Romanov", "Vorobiev", "Sergeev", "Frolov", "Titov", "Belov",
  "Komarov", "Kiselev", "Ilin", "Gusev", "Tarasov", "Kovalev", "Medvedev",
];

function generateRandomName(): string {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${firstName} ${lastName}`;
}

function generateRandomEmail(name: string): string {
  const [firstName, ...lastNameParts] = name.toLowerCase().split(" ");
  const lastName = lastNameParts.join("");
  const randomNum = Math.floor(Math.random() * 1000);
  return `${firstName}.${lastName}${randomNum}@municipal.gov.ph`;
}

async function accountTool(args: Array<string>) {
  const opts = cmdParser(args);

  switch (opts.command) {
  case "create-account":
    await handleCreateAccount(opts.opts);
    break;
  case "create-office":
    await handleCreateOffice(opts.opts);
    break;
  case "create-role":
    await handleCreateRole(opts.opts);
    break;
  case "create-all":
    await handleSeedMunicipal();
    break;
  default:
    console.log("account-tool [command] [options]");
    console.log("");
    console.log("  create-account          Creates a new account.");
    console.log("  create-office           Creates a new office.");
    console.log("  create-role             Creates a new role.");
    console.log("  create-all              Creates new municipal offices, roles, and accounts.");
    console.log("");
    console.log("For command specific help, use <command> --help.");
    console.log("");
  }
}

async function handleCreateAccount(opts: Record<string, string | boolean>) {
  if (opts["--help"]) {
    console.log("account-tool create-account [options]");
    console.log("");
    console.log("  --name <string>      Specify the name of the account. (Required)");
    console.log("  --positionId <uuid>  Specify the role of the account. (Required)");
    console.log("  --officeId <uuid>    Specify the office of the account. (Required)");
    console.log("  --email <string>     Specify the email of the account. (Required)");
    console.log("  --enabled            Enable the account. If not specified, account will require an manual approval.");
    console.log("");
    console.log("Notes: Position ID should belong to the specified Office ID.");
    console.log("");

    return null;
  }

  // Validate
  const name = opts["--name"] as string;
  if (!validators.isNotEmpty(name)) {
    console.error("Invalid name.");
    return null;
  }

  const officeId = opts["--officeId"] as string;
  if (!validators.isUuid(officeId)) {
    console.error("Invalid office ID.");
    return null;
  }

  const positionId = opts["--positionId"] as string;
  if (!validators.isUuid(positionId)) {
    console.error("Invalid position ID.");
    return null;
  }

  const email = opts["--email"] as string;
  if (!validators.isEmail(email)) {
    console.error("Invalid email.");
    return null;
  }

  const enabled = opts["--enabled"] as boolean;

  // Create the account via
  const password = await generatePassword(16, false);
  const newUser = await auth.api.signUpEmail({
    returnHeaders: false,
    body: {
      name,
      email,
      password,
      officeId: officeId,
      officePositionId: positionId,
    },
  });

  if (enabled) {
    await db.update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, newUser.user.id));
  }

  console.log("Account created:");
  console.log("");
  console.log("  Email:    %s", email);
  console.log("  Password: %s", password);
  console.log("  User ID:  %s", newUser.user.id);
  console.log("  Enabled:  %s", enabled ? "Yes" : "No");
  console.log("");

  return { userId: newUser.user.id, email, password };
}

async function handleCreateOffice(opts: Record<string, string | boolean>) {
  if (opts["--help"]) {
    console.log("account-tool create-office [options]");
    console.log("");
    console.log("  --name <string>      Specify the name of the office. (Required)");
    console.log("                       Office names should not be the same. They should be unique.");
    console.log("");

    return null;
  }

  const name = opts["--name"] as string;
  if (!validators.isNotEmpty(name)) {
    console.error("Invalid name.");
    return null;
  }

  const newOffice = await office.createOffice(opts["--name"] as string);
  let officeId = null;

  oneOf(newOffice)
    .match(
      s => {
        console.log("Office created:");
        console.log("  Name: %s", s.name);
        console.log("  Office ID: %s", s.id);
        console.log("");
        officeId = s.id;
      },
      e => {
        console.error("Office failed to create.");
        console.error("Stack ==========================================");
        console.error("%d: %s", e.type, e.message);
        console.error("Params: %s", JSON.stringify(e.additionalContext || {}));
        console.error(e.trace);
        console.error("================================================");
      });

  return officeId;
}

async function handleCreateRole(opts: Record<string, string | boolean>) {
  if (opts["--help"]) {
    console.log("account-tool create-role [options]");
    console.log("");
    console.log("  --name <string>      Specify the name of the role. (Required)");
    console.log("  --officeId <uuid>    ID of the office where this role is added. (Required)");
    console.log("  --perms <string>     Comma separated permissions (No spaces allowed).");
    console.log("                       If unspecified, this will default to no permissions.");
    console.log("");

    return null;
  }

  const name = opts["--name"] as string;
  if (!validators.isNotEmpty(name)) {
    console.error("Invalid name.");
    return null;
  }

  const officeId = opts["--officeId"] as string;
  if (!validators.isUuid(officeId)) {
    console.error("Invalid office ID.");
    return null;
  }

  const permissionsStr = opts["--perms"] as string ?? "";
  const permissions = [...new Set(permissionsStr.split(" "))]
    .filter(x => validators.isNotEmpty(x)) as Permissions[];

  const newOffice = await office.addRole(officeId, name, permissions);
  let roleId = null;

  oneOf(newOffice)
    .match(
      s => {
        console.log("Role created:");
        console.log("  Role Name: %s", s.name);
        console.log("  Role ID: %s", s.id);
        console.log("  Permissions: %s", JSON.stringify(s.permissions, null, 2));
        console.log("");
        roleId = s.id;
      },
      e => {
        console.error("Role failed to create.");
        console.error("Stack ==========================================");
        console.error("%d: %s", e.type, e.message);
        console.error("Params: %s", JSON.stringify(e.additionalContext || {}));
        console.error(e.trace);
        console.error("================================================");
      });

  return roleId;
}

async function handleSeedMunicipal() {
  console.log("Starting municipal seeding process...\n");
  // Step 1: Create Mayor's Office
  const mayorOfficeId = await handleCreateOffice({ "--name": "Mayor's Office" });
  if (!mayorOfficeId) {
    console.error("Failed to create Mayor's Office. Aborting.");
    return;
  }

  // Step 2: Create roles for Budget Office
  const treasurerRoleId = await handleCreateRole({
    "--name": "Municipal Treasurer",
    "--officeId": mayorOfficeId,
    "--perms": "obr.disbursement.treasurer.approve",
  });

  const accountantRoleId = await handleCreateRole({
    "--name": "Municipal Accountant",
    "--officeId": mayorOfficeId,
    "--perms": "obr.disbursement.accountant.approve",
  });

  const budgetOfficerRoleId = await handleCreateRole({
    "--name": "Budget Officer",
    "--officeId": mayorOfficeId,
    "--perms": "obr.management.write obr.management.read obr.approver.basic.high.write esre.read esre.write supplemental.read supplemental.write lbac.data.read lbac.data.write aip.read aip.write saaob.data.read saaob.data.write data-types.manage.read data-types.manage.write travel.approver",
  });

  // Step 3: Create roles for Mayor's Office
  const mayorRoleId = await handleCreateRole({
    "--name": "Mayor",
    "--officeId": mayorOfficeId,
    "--perms": "obr.disbursement.mayor.approve",
  });

  const viceMayorRoleId = await handleCreateRole({
    "--name": "Vice Mayor",
    "--officeId": mayorOfficeId,
    "--perms": "obr.approver.advanced.write obr.approver.advanced.read",
  });

  const headRoleId = await handleCreateRole({
    "--name": "Head",
    "--officeId": mayorOfficeId,
    "--perms": "office.head obr.request.create obr.request.read obr.approver.basic.write obr.approver.basic.read obr.disbursement.create saaob.office.read purchasing.request.create purchasing.request.manage ppmp.read ppmp.manage travel.read travel.write lbac.office.read lbac.office.write",
  });

  // Step 4: Create accounts
  console.log("Creating accounts...\n");

  const accounts: Array<{ name: string; role: string; email: string; password: string }> = [];

  // Budget Office accounts
  if (treasurerRoleId) {
    const name = generateRandomName();
    const email = generateRandomEmail(name);
    console.log(`Creating Municipal Treasurer account for ${name}...`);
    const result = await handleCreateAccount({
      "--name": name,
      "--officeId": mayorOfficeId,
      "--positionId": treasurerRoleId,
      "--email": email,
      "--enabled": true,
    });
    console.log(`✓ ${name} created as Municipal Treasurer\n`);
    if (result) {
      accounts.push({ name, role: "Municipal Treasurer", email, password: result.password });
    }
  }

  if (accountantRoleId) {
    const name = generateRandomName();
    const email = generateRandomEmail(name);
    console.log(`Creating Municipal Accountant account for ${name}...`);
    const result = await handleCreateAccount({
      "--name": name,
      "--officeId": mayorOfficeId,
      "--positionId": accountantRoleId,
      "--email": email,
      "--enabled": true,
    });
    console.log(`✓ ${name} created as Municipal Accountant\n`);
    if (result) {
      accounts.push({ name, role: "Municipal Accountant", email, password: result.password });
    }
  }

  if (budgetOfficerRoleId) {
    const name = generateRandomName();
    const email = generateRandomEmail(name);
    console.log(`Creating Budget Officer account for ${name}...`);
    const result = await handleCreateAccount({
      "--name": name,
      "--officeId": mayorOfficeId,
      "--positionId": budgetOfficerRoleId,
      "--email": email,
      "--enabled": true,
    });
    console.log(`✓ ${name} created as Budget Officer\n`);
    if (result) {
      accounts.push({ name, role: "Budget Officer", email, password: result.password });
    }
  }

  if (mayorRoleId) {
    const name = generateRandomName();
    const email = generateRandomEmail(name);
    console.log(`Creating Mayor account for ${name}...`);
    const result = await handleCreateAccount({
      "--name": name,
      "--officeId": mayorOfficeId,
      "--positionId": mayorRoleId,
      "--email": email,
      "--enabled": true,
    });
    console.log(`✓ ${name} created as Mayor\n`);
    if (result) {
      accounts.push({ name, role: "Mayor", email, password: result.password });
    }
  }

  if (viceMayorRoleId) {
    const name = generateRandomName();
    const email = generateRandomEmail(name);
    console.log(`Creating Vice Mayor account for ${name}...`);
    const result = await handleCreateAccount({
      "--name": name,
      "--officeId": mayorOfficeId,
      "--positionId": viceMayorRoleId,
      "--email": email,
      "--enabled": true,
    });
    console.log(`✓ ${name} created as Vice Mayor\n`);
    if (result) {
      accounts.push({ name, role: "Vice Mayor", email, password: result.password });
    }
  }

  if (headRoleId) {
    const name = generateRandomName();
    const email = generateRandomEmail(name);
    console.log(`Creating Head account for ${name}...`);
    const result = await handleCreateAccount({
      "--name": name,
      "--officeId": mayorOfficeId,
      "--positionId": headRoleId,
      "--email": email,
      "--enabled": true,
    });
    console.log(`✓ ${name} created as Head\n`);
    if (result) {
      accounts.push({ name, role: "Head", email, password: result.password });
    }
  }

  console.log("\nSummary:");
  accounts.forEach(a => console.log(`  • ${a.role} - ${a.name} | ${a.email} | ${a.password}`));
}

function cmdParser(opts: Array<string>) {
  const tokens: { command: string; opts: Record<string, string | boolean> } = {
    command: "",
    opts: {},
  };

  let valueMode: string | null = null;
  let position = 0;

  while (position < opts.length) {
    const arg = opts[position];

    if (valueMode !== null) {
      let skips = 0;

      while ((skips + position) < opts.length) {
        const val = opts[(skips + position)];

        // If the val starts with a double dash "--" it will break the inner loop
        if (val.startsWith("--")) break;

        if (tokens.opts[valueMode] === true) {
          tokens.opts[valueMode] = val; // First value overwrites `true`
        } else {
          tokens.opts[valueMode] += (" " + val); // Subsequent values append
        }

        skips += 1;
      }

      valueMode = null;
      position += skips;
      continue;
    }

    if (/^--[a-z0-9]+$/i.test(arg)) {
      valueMode = arg;
      tokens.opts[arg] = true;
      position++;
      continue;
    }

    if (!tokens.command && /^[a-z0-9\-]+$/i.test(arg)) {
      tokens.command = arg;
      position++;
      continue;
    }

    position++;
  }

  return tokens;
}


accountTool(process.argv.slice(2))
  .catch(console.error);
