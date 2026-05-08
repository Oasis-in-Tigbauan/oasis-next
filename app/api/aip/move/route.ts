import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as aipService from "@/lib/aip";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.AIP_READ, permission.AIP_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<MoveRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<MoveRequest>(body, {
    properties: {
      ids: {
        type: "object",
        formatterFn: async value => {
          if (!Array.isArray(value) || value.length === 0) {
            return { ok: false, error: "ids must be a non-empty array." };
          }

          for (let index = 0; index < value.length; index++) {
            if (!validatorUtilities.isUuid(value[index])) {
              return { ok: false, error: `Invalid AIP reference ID at position ${index}.` };
            }
          }

          return { ok: true };
        },
      },
      parentId: {
        type: "string",
        formatterFn: async value => {
          if (value === null || value === undefined) return { ok: true };
          if (!validatorUtilities.isUuid(value)) {
            return { ok: false, error: "Invalid target parent ID." };
          }
          return { ok: true };
        },
      },
    },
    requiredProperties: ["ids"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await aipService.move(body.ids, body.parentId ?? null);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type MoveRequest = {
  ids: string[];
  parentId?: string | null;
};
