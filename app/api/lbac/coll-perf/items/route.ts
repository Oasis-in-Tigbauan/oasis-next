import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

type CreateCollPerfItemBody = {
  parentId: string;
  particulars: string;
  accountCode?: string | null;
  incomeTarget: string;
  monthlyData?: Array<{
    month: number;
    year: number;
    value: string;
  }>;
};

export async function POST(req: NextRequest) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateCollPerfItemBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<CreateCollPerfItemBody>(body, {
    properties: {
      parentId: { type: "string", formatter: "uuid" },
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
      incomeTarget: { type: "string", formatter: "decimal" },
      monthlyData: {
        type: "object",
        formatterFn: async (v) => {
          if (v === undefined || v === null) {
            return { ok: true };
          }
          if (!Array.isArray(v)) {
            return { ok: false, error: "monthlyData must be an array." };
          }
          for (let i = 0; i < v.length; i++) {
            const entry = v[i];
            if (typeof entry !== "object" || entry === null) {
              return { ok: false, error: `Invalid monthlyData entry at index ${i}.` };
            }
            if (!validatorUtilities.isNumber(entry.month) || entry.month < 1 || entry.month > 12) {
              return { ok: false, error: `Invalid month in monthlyData[${i}]. Must be 1–12.` };
            }
            if (!validatorUtilities.isNumber(entry.year)) {
              return { ok: false, error: `Invalid year in monthlyData[${i}].` };
            }
            if (typeof entry.value !== "string" || !validatorUtilities.isNumber(entry.value, false, false)) {
              return { ok: false, error: `Invalid value in monthlyData[${i}]. Must be a numeric string.` };
            }
          }
          return { ok: true };
        },
      },
    },
    requiredProperties: ["parentId", "particulars", "incomeTarget"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const { parentId, ...payload } = body;
  const result = await lbac.collCreateItem(session.user!, parentId, payload);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
