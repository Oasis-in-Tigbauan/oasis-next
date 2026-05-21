import "dotenv/config";

import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import * as office from "@/lib/office";
import { type Permissions } from "@/lib/db/permissions";
import * as validators from "@/lib/validators/utilities";
import { oneOf } from "@/lib/one-of";
import { user } from "@/lib/db/schema";
import * as utils from "@/scripts/utils.mjs";

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
  default:
    console.log("account-tool [command] [options]");
    console.log("");
    console.log("  create-account          Creates a new account.");
    console.log("  create-office           Creates a new office.");
    console.log("  create-role             Creates a new role.");
    console.log("  update-account          Updates a specific account.");
    console.log("  update-office           Updates a specific office.");
    console.log("  update-role             Updates a specific role.");
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

    return;
  }

  // Validate
  const name = opts["--name"] as string;
  if (!validators.isNotEmpty(name)) {
    console.error("Invalid name.");
    return;
  }

  const officeId = opts["--officeId"] as string;
  if (!validators.isUuid(officeId)) {
    console.error("Invalid office ID.");
    return;
  }

  const positionId = opts["--positionId"] as string;
  if (!validators.isUuid(positionId)) {
    console.error("Invalid position ID.");
    return;
  }

  const email = opts["--email"] as string;
  if (!validators.isEmail(email)) {
    console.error("Invalid email.");
    return;
  }

  const enabled = opts["--enabled"] as boolean;

  // Create the account via
  const password = utils.token.generatePassword(16);
  const newUser = await auth.api.signUpEmail({
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
}

async function handleCreateOffice(opts: Record<string, string | boolean>) {
  if (opts["--help"]) {
    console.log("account-tool create-office [options]");
    console.log("");
    console.log("  --name <string>      Specify the name of the office. (Required)");
    console.log("                       Office names should not be the same. They should be unique.");
    console.log("");

    return;
  }

  const name = opts["--name"] as string;
  if (!validators.isNotEmpty(name)) {
    console.error("Invalid name.");
    return;
  }

  const newOffice = await office.createOffice(opts["--name"] as string);
  oneOf(newOffice)
    .match(
      s => {
        console.log("Office created:");
        console.log("  Name: %s", s.name);
        console.log("  Office ID: %s", s.id);
        console.log("");
      },
      e => {
        console.error("Office failed to create.");
        console.error("Stack ==========================================");
        console.error("%d: %s", e.type, e.message);
        console.error("Params: %s", JSON.stringify(e.additionalContext || {}));
        console.error(e.trace);
        console.error("================================================");
      });
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

    return;
  }

  const name = opts["--name"] as string;
  if (!validators.isNotEmpty(name)) {
    console.error("Invalid name.");
    return;
  }

  const officeId = opts["--officeId"] as string;
  if (!validators.isUuid(officeId)) {
    console.error("Invalid office ID.");
    return;
  }

  const permissionsStr = opts["--perms"] as string ?? "";
  const permissions = [...new Set(permissionsStr.split(" "))]
    .filter(x => validators.isNotEmpty(x)) as Permissions[];

  const newOffice = await office.addRole(officeId, name, permissions);
  oneOf(newOffice)
    .match(
      s => {
        console.log("Role created:");
        console.log("  Role Name: %s", s.name);
        console.log("  Role ID: %s", s.id);
        console.log("  Permissions: %s", JSON.stringify(s.permissions, null, 2));
        console.log("");
      },
      e => {
        console.error("Role failed to create.");
        console.error("Stack ==========================================");
        console.error("%d: %s", e.type, e.message);
        console.error("Params: %s", JSON.stringify(e.additionalContext || {}));
        console.error(e.trace);
        console.error("================================================");
      });
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
