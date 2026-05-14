import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as saaob from "@/lib/saaob";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

type CreateGroupBody = {
  name: string;
  parentId?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateGroupBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<CreateGroupBody>(body, {
    properties: {
      name: { type: "string", formatter: "non-empty-string" },
      parentId: { type: "string", formatter: "uuid" },
    },
    requiredProperties: ["name"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const result = await saaob.createGroup(body.name, session.user!, body.parentId);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status201Created).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
