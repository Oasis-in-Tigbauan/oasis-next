import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import * as purchasing from "@/lib/forms/purchasing";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/forms/purchasing/[id]">,
) {
  const session = await auth.verify([
    permission.PURCHASING_REQUEST_MANAGE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such purchase request item found.")
      .build();
  }

  const body = await tryParseJson<UpdatePurchaseRequestBody>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<UpdatePurchaseRequestBody>(body, {
    properties: {
      prNumber: { type: "string", formatter: "non-empty-string" },
      purpose: { type: "string", formatter: "non-empty-string" },
      supplier: { type: "string", formatter: "non-empty-string" },
      address: { type: "string", formatter: "non-empty-string" },
      tinNumber: { type: "string", formatter: "non-empty-string" },
      purchaseOrderNumber: { type: "string", formatter: "non-empty-string" },
      modeOfProcurementId: { type: "string", formatter: "uuid" },
      placeOfDelivery: { type: "string", formatter: "non-empty-string" },
      dateOfDelivery: { type: "string", formatter: "non-empty-string" },
      deliveryTerm: { type: "string", formatter: "non-empty-string" },
      paymentTerm: { type: "string", formatter: "non-empty-string" },
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
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await purchasing.updateRequest(id, body, session.user!);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext<"/api/forms/purchasing/[id]">,
) {
  const session = await auth.verify([
    permission.PURCHASING_REQUEST_MANAGE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such purchase request item found.")
      .build();
  }

  const result = await purchasing.deletePurchaseRequest(id, session.user!);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status200Ok).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type UpdatePurchaseRequestBody = purchasing.UpdatePurchaseRequestPayload;
