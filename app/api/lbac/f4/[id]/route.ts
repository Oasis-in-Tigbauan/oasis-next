import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import type { UpdateF4ItemPayload } from "@/lib/lbac";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/lbac/f4/[id]">,
) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "No such item found.").build();
  }

  const body = await tryParseJson<UpdateF4ItemPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<UpdateF4ItemPayload>(body, {
    properties: {
      particulars: { type: "string", formatter: "non-empty-string" },
      accountCode: {
        type: "string",
        formatterFn: async (v) => {
          if (v === null || v === undefined) {
            return { ok: true };
          }
          if (typeof v !== "string" || !validatorUtilities.isNotEmpty(v)) {
            return { ok: false, error: "accountCode must be a non-empty string or null." };
          }
          return { ok: true };
        },
      },
      estimate: {
        type: "string",
        formatterFn: async (v) => {
          if (v === null || v === undefined) {
            return { ok: true };
          }
          if (typeof v !== "string" || !validatorUtilities.isNumber(v, false, false)) {
            return { ok: false, error: "estimate must be a valid decimal string or null." };
          }
          return { ok: true };
        },
      },
      actual: {
        type: "string",
        formatterFn: async (v) => {
          if (v === null || v === undefined) {
            return { ok: true };
          }
          if (typeof v !== "string" || !validatorUtilities.isNumber(v, false, false)) {
            return { ok: false, error: "actual must be a valid decimal string or null." };
          }
          return { ok: true };
        },
      },
      remarks: {
        type: "string",
        formatterFn: async (v) => {
          if (v === null || v === undefined) {
            return { ok: true };
          }
          if (typeof v !== "string") {
            return { ok: false, error: "remarks must be a string or null." };
          }
          return { ok: true };
        },
      },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });

  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const result = await lbac.updateF4Item(id, body);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext<"/api/lbac/f4/[id]">,
) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "No such item found.").build();
  }

  const result = await lbac.deleteF4Item(id);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
