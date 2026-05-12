import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import * as supplementalService from "@/lib/supplemental";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([permission.SUPPLEMENTAL_READ, permission.SUPPLEMENTAL_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such item found.")
      .build();
  }

  const body = await tryParseJson<PatchSupplementalRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<PatchSupplementalRequest>(body, {
    properties: {
      supplementalOrAugmentation: { type: "string", formatter: "non-empty-string" },
      charges: { type: "string", formatter: "non-empty-string" },
      amount: { type: "string", formatter: "decimal" },
      supplementalType: {
        type: "string",
        formatterFn: async v => {
          if (typeof v !== "string" || !["less", "add"].includes(v)) {
            return { ok: false, error: "supplementalType must be one of: less, add." };
          }
          return { ok: true };
        },
      },
      aipCode: {
        type: "string",
        formatterFn: async v => {
          if (!validatorUtilities.isUuid(v)) {
            return { ok: false, error: "Invalid AIP reference ID." };
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await supplementalService.update(id, body);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([permission.SUPPLEMENTAL_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such item found.")
      .build();
  }

  const result = await supplementalService.remove(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type PatchSupplementalRequest = {
  supplementalOrAugmentation?: string;
  charges?: string;
  amount?: string;
  supplementalType?: "less" | "add";
  aipCode?: string;
};
