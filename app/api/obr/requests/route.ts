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
    permission.OBR_APPROVER_BASIC_READ,
    permission.OBR_APPROVER_BASIC_HIGH_WRITE,
    permission.OBR_APPROVER_ADVANCED_READ,
    permission.OBR_REQUEST_READ,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Get the list of the requests
  const users = await obr.list(session.user!);
  return oneOf(users).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([
    permission.OBR_REQUEST_CREATE,
  ]);
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
      requestNumber: { type: "string", formatter: "non-empty-string" },
      payee: { type: "string", formatter: "non-empty-string" },
      officeAddress: { type: "string", formatter: "non-empty-string" },
      obrNumber: { type: "string", formatter: "non-empty-string" },
      prNumber: { type: "string", formatter: "non-empty-string" },
      requestItems: {
        type: "object",
        formatterFn: async o => {
          for (let i = 0; i < o.length; i++) {
            if (!validatorUtilities.isUuid(o[i].expenseCodeId)) {
              return { ok: false, error: "Invalid ID for expense code at position: " + i };
            }

            if (!validatorUtilities.isUuid(o[i].responsibilityCenterId)) {
              return { ok: false, error: "Invalid ID for responsibility center at position: " + i };
            }

            if (!validatorUtilities.isNotEmpty(o[i].particulars)) {
              return { ok: false, error: "Particulars cannot be empty at position: " + i };
            }

            if (!validatorUtilities.isNumber(o[i].amount, false, true)) {
              return { ok: false, error: "Invalid amount at position: " + i };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["requestNumber", "payee", "officeAddress", "requestItems"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const invitation = await obr.createRequest(body, session.user!);
  return oneOf(invitation).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateNewRequestType = {
  requestNumber: string;
  payee: string;
  officeAddress: string;
  obrNumber?: string;
  prNumber?: string;
  requestItems: Array<{
    responsibilityCenterId: string;
    expenseCodeId: string;
    particulars: string;
    amount: string;
  }>
}
