import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import * as esreService from "@/lib/esre";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/esre/[id]">,
) {
  const session = await auth.verify([permission.ESRE_READ, permission.ESRE_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such item found.")
      .build();
  }

  const body = await tryParseJson<PatchEsreRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<PatchEsreRequest>(body, {
    properties: {
      payee: { type: "string", formatter: "non-empty-string" },
      natureOfPayment: { type: "string", formatter: "non-empty-string" },
      amount: { type: "string", formatter: "decimal" },
      fundingSourceId: {
        type: "string",
        formatterFn: async v => {
          if (!validatorUtilities.isUuid(v)) {
            return { ok: false, error: "Invalid funding source ID." };
          }
          return { ok: true };
        },
      },
      checkStatus: {
        type: "string",
        formatterFn: async v => {
          const valid = ["PAID", "FOR RELEASE", "ON HOLD", "CANCELLED"];
          if (!valid.includes(v!)) {
            return { ok: false, error: `checkStatus must be one of: ${valid.join(", ")}.` };
          }
          return { ok: true };
        },
      },
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
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await esreService.update(id, body);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext<"/api/esre/[id]">,
) {
  const session = await auth.verify([permission.ESRE_READ, permission.ESRE_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such item found.")
      .build();
  }

  const result = await esreService.remove(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type PatchEsreRequest = {
  payee?: string;
  natureOfPayment?: string;
  amount?: string;
  fundingSourceId?: string;
  checkStatus?: "ON HOLD" | "FOR RELEASE" | "PAID" | "CANCELLED" | null;
  remarks?: string;
  obrId?: string | null;
  expenseTypeId?: string;
  saaobId?: string | null;
  dvOrPayrollNumber?: string;
  checkNumber?: string;
};
