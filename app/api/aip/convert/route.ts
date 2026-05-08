import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as aipService from "@/lib/aip";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { validator } from "@/lib/validators";

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.AIP_READ, permission.AIP_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<ConvertRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<ConvertRequest>(body, {
    properties: {
      id: { type: "string", formatter: "uuid" },
      targetType: {
        type: "string",
        formatterFn: async value => {
          if (value !== "group" && value !== "item") {
            return { ok: false, error: "targetType must be either 'group' or 'item'." };
          }
          return { ok: true };
        },
      },
    },
    requiredProperties: ["id", "targetType"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await aipService.convert(body.id, body.targetType);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type ConvertRequest = {
  id: string;
  targetType: "group" | "item";
};
