import type { NextRequest } from "next/server";

import { session as auth } from "@/lib/auth";
import * as offices from "@/lib/office";
import { oneOf } from "@/lib/one-of";
import * as permission from "@/lib/db/permissions";
import type { Permissions } from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: RouteContext<"/api/management/offices/[id]/roles/[roleId]">) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session) {
    return ResponseComposer.composeError(StatusCodes.Status403Forbidden, "Forbidden")
      .orchestrate();
  }

  const { id, roleId } = await params;
  if (!validatorUtilities.isNotEmpty(id) || !validatorUtilities.isNotEmpty(roleId)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, "Not found.")
      .orchestrate();
  }

  const body = await tryParseJson<RolePatchRequest>(req);
  if (!body) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
  }

  // Validation
  const validation = await validator.validate(body, {
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
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
  }

  const update = await offices.updateRole(id, roleId, body.name, body.permissions);
  return oneOf(update).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type RolePatchRequest = Partial<{
  name: string;
  permissions: Permissions[];
}>
