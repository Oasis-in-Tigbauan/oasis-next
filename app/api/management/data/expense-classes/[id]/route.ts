import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as expenseClasses from "@/lib/field-types/expense";
import { oneOf } from "@/lib/one-of";
import * as permissions from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: RouteContext<"/api/management/data/expense-classes/[id]">) {
  const session = await auth.verify([
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "Not found.")
      .build();
  }

  const body = await tryParseJson<PatchPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const validation = await validator.validate<PatchPayload>(body, {
    properties: {
      accountName: { type: "string", formatter: "non-empty-string" },
      fpp: { type: "string", formatter: "non-empty-string" },
      classification: { type: "string", formatter: "non-empty-string" },
      subClassification: { type: "string", formatter: "non-empty-string" },
      group: { type: "string", formatter: "non-empty-string" },
      accountCode: { type: "string", formatter: "non-empty-string" },
      class: { type: "string", formatter: "non-empty-string" },
      allowedOfficeCodeIds: {
        type: "object",
        formatterFn: async v => {
          if (!Array.isArray(v)) {
            return { ok: false, error: "Invalid array." };
          }

          for (let i = 0; i < v.length; i++) {
            if (!validatorUtilities.isUuid(v[i])) {
              return { ok: false, error: "Invalid item at position " + i };
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  const data = await expenseClasses.update(id, body);
  return oneOf(data).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(req: NextRequest, { params }: RouteContext<"/api/management/data/expense-classes/[id]">) {
  const session = await auth.verify([
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "Not found.")
      .build();
  }

  const data = await expenseClasses.removeSoftly(id);
  return oneOf(data).match(
    () => ApiResponseBuilder.create(StatusCodes.Status202Accepted).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type PatchPayload = Partial<{
  accountName: string;
  fpp: Optional<string>;
  classification: Optional<string>;
  subClassification: Optional<string>;
  group: Optional<string>;
  accountCode: Optional<string>;
  class: Optional<string>;
  allowedOfficeCodeIds: string[];
}>
