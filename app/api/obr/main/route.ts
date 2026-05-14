import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import * as obr from "@/lib/obr";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function GET() {
  const session = await auth.verify([permission.OBR_MANAGEMENT_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await obr.getAllObrMainData();
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.OBR_MANAGEMENT_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateObrMainDataBody>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validated = await validator.validate<CreateObrMainDataBody>(body, {
    properties: {
      requestId: { type: "string", formatter: "uuid" },
      obrNumber: { type: "string", formatter: "non-empty-string" },
      prNumber: { type: "string", formatter: "non-empty-string" },
      prAmount: { type: "string", formatter: "decimal" },
      saaobId: { type: "string", formatter: "uuid" },
      aipReferences: {
        type: "object",
        formatterFn: async v => {
          if (!Array.isArray(v)) {
            return { ok: false, error: "Invalid array." };
          }

          for (let i = 0; i < v.length; i++) {
            if (typeof v[i] !== "object" || !validatorUtilities.isExisty(v[i])) {
              return { ok: false, error: "Invalid object in position " + i };
            }

            if (!validatorUtilities.isUuid(v[i].aipId)) {
              return { ok: false, error: "Invalid aipId in position " + i };
            }

            if (!validatorUtilities.isNumber(v[i].amount, false, false)) {
              return { ok: false, error: "Invalid amount in position " + i };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["requestId", "obrNumber"],
    allowUnvalidatedProperties: true,
  });
  if (!validated.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validated.errors!)
      .build();
  }

  const result = await obr.createObrMainDataFromApprovedRequest(
    body.requestId,
    {
      obrNumber: body.obrNumber,
      prNumber: body.prNumber,
      prAmount: body.prAmount,
      saaobId: body.saaobId,
      aipReferences: body.aipReferences,
    },
    session.user!,
  );

  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateObrMainDataBody = {
  requestId: string;
  obrNumber: string;
  prNumber?: string;
  prAmount?: string;
  saaobId?: string;
  aipReferences?: Array<{ aipId: string; amount: string }>;
};
