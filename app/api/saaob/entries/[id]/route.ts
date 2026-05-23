import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as saaob from "@/lib/saaob";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";
import type { SaaobUpdateEntryPayload } from "@/lib/saaob";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "No such entry found.").build();
  }

  const body = await tryParseJson<SaaobUpdateEntryPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<SaaobUpdateEntryPayload>(body, {
    properties: {
      name: { type: "string", formatter: "non-empty-string" },
      annualBudget: { type: "string", formatter: "decimal" },
      remarks: { type: "string", formatter: "non-empty-string" },
      expenseCodeId: { type: "string", formatter: "uuid" },
      allotmentShouldCopyFromAppropriation: { type: "boolean" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const result = await saaob.updateEntry(id, body);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "No such entry found.").build();
  }

  const result = await saaob.deleteEntry(id);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
