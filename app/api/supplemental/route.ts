import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import * as supplementalService from "@/lib/supplemental";
import { validator, validatorUtilities } from "@/lib/validators";

export async function GET() {
  const session = await auth.verify([permission.SUPPLEMENTAL_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await supplementalService.all();
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.SUPPLEMENTAL_READ, permission.SUPPLEMENTAL_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateSupplementalRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<CreateSupplementalRequest>(body, {
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
      saaobId: {
        type: "string",
        formatterFn: async v => {
          if (!validatorUtilities.isUuid(v)) {
            return { ok: false, error: "Invalid SAAOB entry ID." };
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["amount", "supplementalType"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await supplementalService.create({
    supplementalOrAugmentation: body.supplementalOrAugmentation,
    charges: body.charges,
    amount: body.amount,
    supplementalType: body.supplementalType,
    saaobId: body.saaobId,
    aipCode: body.aipCode,
  }, session.user!.id);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateSupplementalRequest = {
  supplementalOrAugmentation?: string;
  charges?: string;
  amount: string;
  supplementalType: "less" | "add";
  saaobId?: string;
  aipCode?: string;
};
