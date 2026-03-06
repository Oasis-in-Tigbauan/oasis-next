import type { NextRequest } from "next/server";

import { session as auth } from "@/lib/auth";
import * as offices from "@/lib/office";
import { oneOf } from "@/lib/one-of";
import * as permission from "@/lib/db/permissions";
import type { Permissions } from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function POST(req: NextRequest, { params }: RouteContext<"/api/management/offices/[id]/roles">) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session) {
    return ResponseComposer.composeError(StatusCodes.Status403Forbidden, "Forbidden")
      .orchestrate();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, "Not found.")
      .orchestrate();
  }

  const body = await tryParseJson<CreateRoleRequest>(req);
  if (!body) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
  }

  // Validation
  const validate = await validator.validate<CreateRoleRequest>(body, {
    properties: {
      name: { type: "string", formatter: "non-empty-string" },
      permissions: {
        type: "object",
        formatterFn: async p => {
          if (!Array.isArray(p)) {
            return { ok: false, error: "Invalid permissions." };
          }

          for (const cp of p) {
            // Fail early if the permission is invalid
            if (!validatorUtilities.isNotEmpty(cp)) {
              return { ok: false, error: "Empty value found. Not allowed." };
            }

            if (!offices.allowedPermissions.has(cp as Permissions)) {
              return { ok: false, error: `Invalid permission: ${cp}` };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["name", "permissions"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, validate.errors!)
      .orchestrate();
  }

  const result = await offices.addRole(id, body.name, body.permissions);
  return oneOf(result).match(
    s => {
      return ResponseComposer.compose(StatusCodes.Status200Ok)
        .setBody({ ...s, userCount: 0 })
        .orchestrate();
    },
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type CreateRoleRequest = {
  name: string;
  permissions: Permissions[];
}
