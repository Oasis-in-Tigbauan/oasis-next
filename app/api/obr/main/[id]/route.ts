import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import * as obr from "@/lib/obr";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([permission.OBR_MANAGEMENT_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;

  const idValidation = await validator.validate<{ id: string }>({ id }, {
    properties: {
      id: { type: "string", formatter: "uuid" },
    },
    requiredProperties: ["id"],
    allowUnvalidatedProperties: false,
  });
  if (!idValidation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid record identifier.")
      .build();
  }

  const body = await tryParseJson<UpdateObrMainDataBody>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validated = await validator.validate<UpdateObrMainDataBody>(body, {
    properties: {
      obrNumber: { type: "string", formatter: "non-empty-string" },
      prNumber: { type: "string", formatter: "non-empty-string" },
      prAmount: { type: "string", formatter: "decimal" },
      saaobId: { type: "string", formatter: "uuid" },
      payee: { type: "string", formatter: "non-empty-string" },
      address: { type: "string", formatter: "non-empty-string" },
      responsibilityCenterId: { type: "string", formatter: "uuid" },
      expenseCodeId: { type: "string", formatter: "uuid" },
      particulars: { type: "string", formatter: "non-empty-string" },
      amount: { type: "string", formatter: "decimal" },
      aipReferences: {
        type: "object",
        formatterFn: async v => {
          if (!Array.isArray(v)) {
            return { ok: false, error: "Invalid array." };
          }

          for (let i = 0; i < v.length; i++) {
            if (typeof v[i] !== "object" || !validatorUtilities.isExisty(v[i])) {
              return { ok: false, error: "Invalid object in position " + i };
            }

            if (!validatorUtilities.isUuid(v[i].aipId)) {
              return { ok: false, error: "Invalid aipId in position " + i };
            }

            if (!validatorUtilities.isNumber(v[i].amount, false, false)) {
              return { ok: false, error: "Invalid amount in position " + i };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: true,
  });
  if (!validated.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validated.errors!)
      .build();
  }

  const result = await obr.updateObrMainData(
    id,
    {
      obrNumber: body.obrNumber,
      prNumber: body.prNumber,
      prAmount: body.prAmount,
      saaobId: body.saaobId,
      payee: body.payee,
      address: body.address,
      responsibilityCenterId: body.responsibilityCenterId,
      expenseCodeId: body.expenseCodeId,
      particulars: body.particulars,
      amount: body.amount,
      aipReferences: body.aipReferences,
    },
    session.user!,
  );

  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([permission.OBR_MANAGEMENT_WRITE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;

  const idValidation = await validator.validate<{ id: string }>({ id }, {
    properties: {
      id: { type: "string", formatter: "uuid" },
    },
    requiredProperties: ["id"],
    allowUnvalidatedProperties: false,
  });
  if (!idValidation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid record identifier.")
      .build();
  }

  const result = await obr.deleteObrMainData(id, session.user!);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status200Ok).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type UpdateObrMainDataBody = {
  obrNumber?: string;
  prNumber?: string;
  prAmount?: string;
  saaobId?: string | null;
  payee?: string;
  address?: string;
  responsibilityCenterId?: string;
  expenseCodeId?: string;
  particulars?: string;
  amount?: string;
  aipReferences?: Array<{ aipId: string; amount: string }>;
};
