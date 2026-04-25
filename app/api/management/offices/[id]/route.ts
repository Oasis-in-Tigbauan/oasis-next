import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as offices from "@/lib/office";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { validator, validatorUtilities } from "@/lib/validators";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";

export async function GET(
  req: NextRequest,
  { params }: RouteContext<"/api/management/offices/[id]">,
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

  const result = await offices.getOfficeInformationById(id);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/management/offices/[id]">,
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

  const body = await tryParseJson<{ name: string }>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  // Validation
  const validate = await validator.validate<{ name: string }>(body, {
    properties: {
      name: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["name"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await offices.updateOffice(id, body.name);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
