import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import * as purchasing from "@/lib/forms/purchasing";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function POST(
  req: NextRequest,
  { params }: RouteContext<"/api/forms/purchasing/[id]/order">,
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

  const body = await tryParseJson<CreatePurchaseOrderBody>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<CreatePurchaseOrderBody>(body, {
    properties: {
      supplier: { type: "string", formatter: "non-empty-string" },
      address: { type: "string", formatter: "non-empty-string" },
      tinNumber: { type: "string", formatter: "non-empty-string" },
      purchaseOrderNumber: { type: "string", formatter: "non-empty-string" },
      modeOfProcurementId: { type: "string", formatter: "uuid" },
      placeOfDelivery: { type: "string", formatter: "non-empty-string" },
      dateOfDelivery: { type: "string", formatter: "non-empty-string" },
      deliveryTerm: { type: "string", formatter: "non-empty-string" },
      paymentTerm: { type: "string", formatter: "non-empty-string" },
      items: {
        type: "object",
        formatterFn: async value => {
          if (!Array.isArray(value)) {
            return { ok: false, error: "Items must be an array." };
          }

          for (let i = 0; i < value.length; i++) {
            if (!validatorUtilities.isUuid(value[i])) {
              return { ok: false, error: "Invalid item ID at position " + i };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["supplier", "address", "purchaseOrderNumber", "modeOfProcurementId", "items"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const result = await purchasing.createPurchaseOrder(body, session.user!);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreatePurchaseOrderBody = purchasing.PurchaseOrderPayload;
