import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import * as elec from "@/lib/forms/elec";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/forms/elec/[id]">,
) {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_CREATE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such item found.")
      .build();
  }

  const body = await tryParseJson<UpdateElecPayload>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validated = await validator.validate<UpdateElecPayload>(body, {
    properties: {
      dvId: { type: "string", formatter: "uuid" },
      billingName: { type: "string", formatter: "non-empty-string" },
      meterSerial: { type: "string", formatter: "non-empty-string" },
      account: { type: "string", formatter: "non-empty-string" },
      gross: { type: "string", formatter: "decimal" },
      vatableSales: { type: "string", formatter: "decimal" },
      taxType: {
        type: "string",
        formatterFn: async v => {
          if (
            v !== "vat-g" &&
            v !== "vat-s" &&
            v !== "nvat-g" &&
            v !== "nvat-s"
          ) {
            return { ok: false, error: "Invalid tax type." };
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validated.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validated.errors!)
      .build();
  }

  const result = await elec.updateElectricityBill(id, body);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext<"/api/forms/elec/[id]">,
) {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_CREATE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such item found.")
      .build();
  }

  const result = await elec.deleteElectricityBill(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type UpdateElecPayload = {
  dvId?: string;
  billingName?: string;
  meterSerial?: string;
  account?: string;
  gross?: string;
  vatableSales?: string;
  taxType?: string;
};
