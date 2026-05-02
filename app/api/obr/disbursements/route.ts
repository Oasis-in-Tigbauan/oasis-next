import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as obr from "@/lib/obr";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function GET() {
  const session = await auth.verify([
    permission.OBR_APPROVER_BASIC_HIGH_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Get the list of the requests
  const users = await obr.getAllDisbursementVouchers();
  return oneOf(users).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([
    permission.OBR_DISBURSEMENT_CREATE,
    permission.OBR_APPROVER_BASIC_HIGH_WRITE,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Validate inputs
  const body = await tryParseJson<CreateNewRequestType>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<CreateNewRequestType>(body, {
    properties: {
      requestId: { type: "string", formatter: "uuid" },
      items: {
        type: "object",
        formatterFn: async v => {
          if (!Array.isArray(v)) {
            return { ok: false, error: "Invalid item." };
          }

          for (let i = 0; i < v.length; i++) {
            const vi = v[i];
            if (!validatorUtilities.isUuid(vi.targetItemId)) {
              return { ok: false, error: "Invalid target item id at position " + i };
            }

            if (validatorUtilities.isNotEmpty(vi.vatableAmount) && !validatorUtilities.isNumber(vi.vatableAmount, false, true)) {
              return { ok: false, error: "Invalid vatable value at position " + i };
            }

            if (
              validatorUtilities.isNotEmpty(vi.taxType) &&
              vi.taxType !== "vat-g" &&
              vi.taxType !== "vat-s" &&
              vi.taxType !== "nvat-g" &&
              vi.taxType !== "nvat-s"
            ) {
              return { ok: false, error: "Invalid tax type at position " + i };
            }

            if (validatorUtilities.isNotEmpty(vi.fundTypeId) && !validatorUtilities.isUuid(vi.fundTypeId!)) {
              return { ok: false, error: "Invalid fund type id at position " + i };
            }

            if (
              validatorUtilities.isNotEmpty(vi.status) &&
              vi.status !== "PREPARATION" &&
              vi.status !== "PROCESSING" &&
              vi.status !== "ON HOLD" &&
              vi.status !== "FOR RELEASE" &&
              vi.status !== "PAID"
            ) {
              return { ok: false, error: "Invalid status at position " + i };
            }

            if (
              !validatorUtilities.isNotEmpty(vi.accountantId) ||
              !validatorUtilities.isNotEmpty(vi.treasurerId) ||
              !validatorUtilities.isNotEmpty(vi.mayorId)
            ) {
              return { ok: false, error: "Invalid accountant, treasurer, or mayor values at position " + i };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["requestId", "items"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const invitation = await obr
    .createDisbursementVoucher(body.requestId, body.items, session.user!);
  return oneOf(invitation).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateNewRequestType = {
  requestId: string;
  items: Array<{
    targetItemId: string;
    vatableAmount: Optional<string>;
    taxType: Optional<"vat-g" | "vat-s" | "nvat-g" | "nvat-s">;
    fundTypeId: Optional<string>;
    status: Optional<"PREPARATION" | "PROCESSING" | "ON HOLD" | "FOR RELEASE" | "PAID">;

    accountantId: string;
    treasurerId: string;
    mayorId: string;
  }>
}
