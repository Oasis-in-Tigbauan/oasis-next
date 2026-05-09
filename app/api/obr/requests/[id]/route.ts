import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as obr from "@/lib/obr";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function GET(
  req: NextRequest,
  { params }: RouteContext<"/api/obr/requests/[id]">,
) {
  const session = await auth.verify([
    permission.OBR_APPROVER_BASIC_READ,
    permission.OBR_APPROVER_BASIC_HIGH_WRITE,
    permission.OBR_APPROVER_ADVANCED_READ,
    permission.OBR_REQUEST_READ,
    permission.OBR_MANAGEMENT_READ,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Get ID from parameter
  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such item found.")
      .build();
  }

  // Get the list of the requests
  const users = await obr.getObrRequestById(id, session.user!);
  return oneOf(users).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/obr/requests/[id]">,
) {
  const session = await auth.verify([
    permission.OBR_APPROVER_BASIC_WRITE,
    permission.OBR_APPROVER_BASIC_HIGH_WRITE,
    permission.OBR_APPROVER_ADVANCED_WRITE,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Get ID from parameter
  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such request item found.")
      .build();
  }

  // Validate inputs
  const body = await tryParseJson<SetApproverStateRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<SetApproverStateRequest>(body, {
    properties: {
      status: {
        type: "string",
        formatterFn: async s => {
          if (!validatorUtilities.isNotEmpty(s)) {
            return { ok: false, error: "Status cannot be empty." };
          }

          if (s !== "pending" && s !== "approved" && s !== "binned") {
            return { ok: false, error: "Invalid status." };
          }

          return { ok: true };
        },
      },
      reason: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["status"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const invitation = await obr.setApproverState(id, session.user!, body.status, body.reason);
  return oneOf(invitation).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type SetApproverStateRequest = {
  status: "pending" | "approved" | "binned";
  reason?: string;
}
