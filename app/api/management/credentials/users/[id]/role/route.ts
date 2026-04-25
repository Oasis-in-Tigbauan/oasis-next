import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { validator, validatorUtilities } from "@/lib/validators";
import * as offices from "@/lib/office";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/management/credentials/users/[id]/role">,
) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "Not found.")
      .build();
  }

  const payload = await tryParseJson<Payload>(req);
  if (!payload) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  // Validate
  const validation = await validator.validate<Payload>(payload, {
    properties: {
      officeId: { type: "string", formatter: "uuid" },
      roleId: { type: "string", formatter: "uuid" },
    },
    requiredProperties: ["officeId", "roleId"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const result = await offices.switchRoles(id, payload.roleId, payload.officeId);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type Payload = {
  officeId: string;
  roleId: string;
}
