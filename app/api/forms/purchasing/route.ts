import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import * as purchasing from "@/lib/forms/purchasing";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function GET() {
  const session = await auth.verify([
    permission.PURCHASING_REQUEST_MANAGE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await purchasing.getPurchaseRequests(session.user!);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([
    permission.PURCHASING_REQUEST_CREATE,
    permission.PURCHASING_REQUEST_MANAGE,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreatePurchaseRequestBody>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<CreatePurchaseRequestBody>(body, {
    properties: {
      prNumber: { type: "string", formatter: "non-empty-string" },
      purpose: { type: "string", formatter: "non-empty-string" },
      items: {
        type: "object",
        formatterFn: async value => {
          if (!Array.isArray(value)) {
            return { ok: false, error: "Items must be an array." };
          }

          for (let i = 0; i < value.length; i++) {
            const current = value[i];
            if (typeof current !== "object" || !validatorUtilities.isExisty(current)) {
              return { ok: false, error: "Invalid item at position " + i };
            }

            if (!validatorUtilities.isNotEmpty(current.unit)) {
              return { ok: false, error: "Unit cannot be empty at position " + i };
            }

            if (!validatorUtilities.isNotEmpty(current.description)) {
              return { ok: false, error: "Description cannot be empty at position " + i };
            }

            if (!validatorUtilities.isNumber(current.quantity, false, false)) {
              return { ok: false, error: "Invalid quantity at position " + i };
            }

            if (!validatorUtilities.isNumber(current.unitCost, false, false)) {
              return { ok: false, error: "Invalid unit cost at position " + i };
            }
          }

          return { ok: true };
        },
      },
      aip: {
        type: "object",
        formatterFn: async value => {
          if (!Array.isArray(value)) {
            return { ok: false, error: "AIP must be an array." };
          }

          for (let i = 0; i < value.length; i++) {
            const current = value[i];
            if (typeof current !== "object" || !validatorUtilities.isExisty(current)) {
              return { ok: false, error: "Invalid AIP object at position " + i };
            }

            if (!validatorUtilities.isNumber(current.idx, false, true)) {
              return { ok: false, error: "Invalid idx at position " + i };
            }

            if (!validatorUtilities.isUuid(current.id)) {
              return { ok: false, error: "Invalid AIP id at position " + i };
            }
          }

          return { ok: true };
        },
      },
      signatories: {
        type: "object",
        formatterFn: async value => {
          if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value)
          ) {
            return { ok: false, error: "Invalid signatories payload." };
          }

          if (!validatorUtilities.isUuid(value.headOfOfficeId)) {
            return { ok: false, error: "Invalid headOfOfficeId." };
          }

          if (!validatorUtilities.isUuid(value.treasurerId)) {
            return { ok: false, error: "Invalid treasurerId." };
          }

          if (!validatorUtilities.isUuid(value.approverId)) {
            return { ok: false, error: "Invalid approverId." };
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["prNumber", "purpose", "items", "aip", "signatories"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await purchasing.createPurchaseRequest(body, session.user!);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreatePurchaseRequestBody = purchasing.PurchaseRequestPayload;
