import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import * as esreService from "@/lib/esre";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function GET() {
  const session = await auth.verify([permission.ESRE_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await esreService.all();
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.ESRE_READ, permission.ESRE_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateEsreRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<CreateEsreRequest>(body, {
    properties: {
      payee: { type: "string", formatter: "non-empty-string" },
      natureOfPayment: { type: "string", formatter: "non-empty-string" },
      amount: { type: "string", formatter: "decimal" },
      fundingSourceId: { type: "string", formatter: "uuid" },
      remarks: { type: "string", formatter: "non-empty-string" },
      obrId: {
        type: "string",
        formatterFn: async v => {
          if (!validatorUtilities.isUuid(v)) {
            return { ok: false, error: "Invalid OBR item ID." };
          }
          return { ok: true };
        },
      },
      expenseTypeId: {
        type: "string",
        formatterFn: async v => {
          if (!validatorUtilities.isUuid(v)) {
            return { ok: false, error: "Invalid expense type ID." };
          }
          return { ok: true };
        },
      },
      dvOrPayrollNumber: { type: "string", formatter: "non-empty-string" },
      checkNumber: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["payee", "natureOfPayment", "amount", "fundingSourceId"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await esreService.create(body);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateEsreRequest = {
  payee: string;
  natureOfPayment: string;
  amount: string;
  fundingSourceId: string;
  remarks?: string;
  obrId?: string;
  expenseTypeId?: string;
  dvOrPayrollNumber?: string;
  checkNumber?: string;
};
