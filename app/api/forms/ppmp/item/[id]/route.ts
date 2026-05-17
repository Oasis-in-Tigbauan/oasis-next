import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import * as ppmp from "@/lib/forms/ppmp";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([permission.PPMP_READ, permission.PPMP_MANAGE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such plan item found.")
      .build();
  }

  const body = await tryParseJson<Partial<ppmp.ItemPayload>>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validate = await validator.validate<Partial<ppmp.ItemPayload>>(body, {
    properties: {
      quantityOrSize: { type: "string", formatter: "non-empty-string" },
      startOfProcurementActivity: { type: "string", formatter: "non-empty-string" },
      endOfProcurementActivity: { type: "string", formatter: "non-empty-string" },
      expectedDeliveryPeriod: { type: "string", formatter: "non-empty-string" },
      estimatedBudget: { type: "string", formatter: "decimal" },
      // formatterFn must come last — validator returns early after first successful formatterFn
      typeOfProject: {
        type: "string",
        formatterFn: async v => {
          if (v === undefined || v === null) return { ok: true };
          const validTypes = ["goods", "infra", "cons-serv"];
          if (!validTypes.includes(v as string)) {
            return { ok: false, error: `typeOfProject must be one of: ${validTypes.join(", ")}.` };
          }
          return { ok: true };
        },
      },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: true,
  });
  if (!validate.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validate.errors!)
      .build();
  }

  if (body.saaobId !== undefined && !validatorUtilities.isUuid(body.saaobId)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "saaobId must be a valid UUID.")
      .build();
  }

  const result = await ppmp.updateItem(id, body);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([permission.PPMP_READ, permission.PPMP_MANAGE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such plan item found.")
      .build();
  }

  const result = await ppmp.deleteItem(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
