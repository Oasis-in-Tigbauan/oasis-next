import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as officeCodes from "@/lib/field-types/offices";
import { oneOf } from "@/lib/one-of";
import * as permissions from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

export async function GET() {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const data = await officeCodes.all();
  return oneOf(data).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<PostPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validation = await validator.validate<PostPayload>(body, {
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
    requiredProperties: ["aa", "officeId", "headUserId"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const data = await officeCodes.create(body);
  return oneOf(data).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type PostPayload = {
  aa: string;
  code: Optional<string>;
  sector: Optional<string>;
  function: Optional<string>;
  liftOffice: Optional<string>;
  subOffice: Optional<string>;
  officeId: string;
  headUserId: string;
}
