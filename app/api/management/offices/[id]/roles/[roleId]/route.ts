import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as offices from "@/lib/office";
import { oneOf } from "@/lib/one-of";
import * as permission from "@/lib/db/permissions";
import type { Permissions } from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: RouteContext<"/api/management/offices/[id]/roles/[roleId]">) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id, roleId } = await params;
  if (!validatorUtilities.isNotEmpty(id) || !validatorUtilities.isNotEmpty(roleId)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "Not found.")
      .build();
  }

  const body = await tryParseJson<RolePatchRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
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
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const update = await offices.updateRole(id, roleId, body.name, body.permissions);
  return oneOf(update).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type RolePatchRequest = Partial<{
  name: string;
  permissions: Permissions[];
}>
