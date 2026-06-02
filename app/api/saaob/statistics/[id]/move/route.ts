import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { oneOf } from "@/lib/one-of";
import * as saaob from "@/lib/saaob";
import { validator } from "@/lib/validators";

type MoveStatisticBody = {
  parentId: string | null;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.verify([permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;

  const body = await tryParseJson<MoveStatisticBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<MoveStatisticBody>(body, {
    properties: {
      parentId: {
        type: "string",
        formatter: "uuid",
      },
    },
    requiredProperties: ["parentId"],
    allowUnvalidatedProperties: false,
  });

  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const result = await saaob.moveStatisticEntry(id, body.parentId);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status200Ok).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
