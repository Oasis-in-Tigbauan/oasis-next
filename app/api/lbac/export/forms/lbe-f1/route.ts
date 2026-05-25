import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import * as lbac from "@/lib/lbac";
import { LBE_F1_BUDGET_TYPES } from "@/lib/lbac/client";
import { Failure } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

type LbeF1ExportBody = {
  year: number;
  quarter: number;
  implementingUnitId: string;
  budgetType: (typeof LBE_F1_BUDGET_TYPES)[number];
  items: Array<{
    id: string;
    forLaterRelease: string;
    previouslyReleased: string;
  }>;
};

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.LBAC_DATA_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<LbeF1ExportBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  if (
    typeof body.year !== "number"
    || typeof body.quarter !== "number"
    || typeof body.implementingUnitId !== "string"
    || typeof body.budgetType !== "string"
  ) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  if (body.quarter < 1 || body.quarter > 4) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'quarter': must be 1-4.")
      .build();
  }
  if (!validatorUtilities.isUuid(body.implementingUnitId)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'implementingUnitId'.")
      .build();
  }
  if (!LBE_F1_BUDGET_TYPES.includes(body.budgetType)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'budgetType'.")
      .build();
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "At least one selected item is required.")
      .build();
  }

  for (const item of body.items) {
    if (!validatorUtilities.isUuid(item.id)) {
      return ApiResponseBuilder
        .createError(StatusCodes.Status400BadRequest, "Invalid item id in selection.")
        .build();
    }

    const moneyValidation = await validator.validate(item, {
      properties: {
        id: { type: "string", formatter: "uuid" },
        forLaterRelease: { type: "string", formatter: "decimal" },
        previouslyReleased: { type: "string", formatter: "decimal" },
      },
      requiredProperties: ["id", "forLaterRelease", "previouslyReleased"],
      allowUnvalidatedProperties: false,
    });

    if (!moneyValidation.ok) {
      return ApiResponseBuilder
        .createError(StatusCodes.Status400BadRequest, moneyValidation.errors!)
        .build();
    }
  }

  const result = await lbac.exportLbeFOneToBuffer({
    year: body.year,
    quarter: body.quarter,
    implementingUnitId: body.implementingUnitId,
    budgetType: body.budgetType,
    items: body.items,
  });

  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `lbe-f1-${body.year}-Q${body.quarter}.xlsx`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
