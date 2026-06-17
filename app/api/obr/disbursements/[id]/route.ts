import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as obr from "@/lib/obr";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/obr/disbursements/[id]">,
) {
  const session = await auth.verify([
    permission.OBR_DISBURSEMENT_CREATE,
    permission.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Get ID from parameter
  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such item found.")
      .build();
  }

  // Validate inputs
  const body = await tryParseJson<UpdatePayload>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<UpdatePayload>(body, {
    properties: {
      particulars: { type: "string", formatter: "non-empty-string" },
      explanation: { type: "string", formatter: "non-empty-string" },
      grossAmount: { type: "string", formatter: "decimal" },
      vatableAmount: { type: "string", formatter: "decimal" },
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
      fundTypeId: { type: "string", formatter: "uuid" },
      status: {
        type: "string",
        formatterFn: async v => {
          if (
            v !== "PREPARATION" &&
            v !== "PROCESSING" &&
            v !== "ON HOLD" &&
            v !== "FOR RELEASE" &&
            v !== "PAID"
          ) {
            return { ok: false, error: "Invalid status." };
          }

          return { ok: true };
        },
      },
      obrItemId: { type: "string", formatter: "uuid" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  const updated = await obr.updateDisbursementVoucher(id, body, session.user!);
  return oneOf(updated).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type UpdatePayload = {
  particulars?: Optional<string>;
  explanation?: Optional<string>;
  grossAmount?: Optional<string>;
  vatableAmount: Optional<string>;
  taxType: Optional<"vat-g" | "vat-s" | "nvat-g" | "nvat-s">;
  fundTypeId: Optional<string>;
  status: Optional<"PREPARATION" | "PROCESSING" | "ON HOLD" | "FOR RELEASE" | "PAID">;
  obrItemId: Optional<string>;
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext<"/api/obr/disbursements/[id]">,
) {
  const session = await auth.verify([
    permission.OBR_DISBURSEMENT_CREATE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such item found.")
      .build();
  }

  const deleted = await obr.deleteDisbursementVoucher(id, session.user!);
  return oneOf(deleted).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
