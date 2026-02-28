import type { NextRequest } from "next/server";

import { session as auth } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
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
  if (!session) {
    return ResponseComposer.composeError(StatusCodes.Status403Forbidden, "Forbidden")
      .orchestrate();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, "Not found.")
      .orchestrate();
  }

  const payload = await tryParseJson<Payload>(req);
  if (!payload) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
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
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
  }

  const result = await offices.switchRoles(id, payload.roleId, payload.officeId);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type Payload = {
  officeId: string;
  roleId: string;
}
