import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as officeCodes from "@/lib/field-types/offices";
import { oneOf } from "@/lib/one-of";
import * as permissions from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: RouteContext<"/api/management/data/office-codes/[id]">) {
  const session = await auth.verify([
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "Not found.")
      .build();
  }

  const body = await tryParseJson<PatchPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validation = await validator.validate<PatchPayload>(body, {
    properties: {
      aa: { type: "string", formatter: "non-empty-string" },
      code: { type: "string", formatter: "non-empty-string" },
      sector: { type: "string", formatter: "non-empty-string" },
      function: { type: "string", formatter: "non-empty-string" },
      liftOffice: { type: "string", formatter: "non-empty-string" },
      subOffice: { type: "string", formatter: "non-empty-string" },
      officeId: { type: "string", formatter: "non-empty-string" },
      headUserId: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const data = await officeCodes.update(id, {
    aa: body.aa ?? undefined,
    code: body.code,
    sector: body.sector,
    function: body.function,
    liftOffice: body.liftOffice,
    subOffice: body.subOffice,
    officeId: body.officeId,
    headUserId: body.headUserId,
  });
  return oneOf(data).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type PatchPayload = Partial<{
  aa: Optional<string>;
  code: Optional<string>;
  sector: Optional<string>;
  function: Optional<string>;
  liftOffice: Optional<string>;
  subOffice: Optional<string>;
  officeId: Optional<string>;
  headUserId: Optional<string>;
}>;
