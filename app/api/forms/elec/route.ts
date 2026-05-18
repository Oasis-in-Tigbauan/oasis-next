import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import * as elec from "@/lib/forms/elec";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";
import { validator } from "@/lib/validators";

export async function GET() {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_CREATE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await elec.getAll();
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_CREATE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateElecPayload>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validated = await validator.validate<CreateElecPayload>(body, {
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
    requiredProperties: [
      "dvId",
      "billingName",
      "meterSerial",
      "account",
      "gross",
      "vatableSales",
      "taxType",
    ],
    allowUnvalidatedProperties: false,
  });
  if (!validated.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validated.errors!)
      .build();
  }

  const result = await elec.createElectricityBill(body);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateElecPayload = {
  dvId: string;
  billingName: string;
  meterSerial: string;
  account: string;
  gross: string;
  vatableSales: string;
  taxType: string;
};
