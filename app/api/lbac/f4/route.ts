import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import type { CreateF4ItemPayload } from "@/lib/lbac";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

type LbacF4IncomingRequest = {
  forFiscalYear: number;
  contents: CreateF4ItemPayload[];
};

async function validateF4ContentItem(
  item: unknown,
  index: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof item !== "object" || item === null) {
    return { ok: false, error: `Invalid contents entry at ${index}.` };
  }

  const entry = item as Record<string, unknown>;

  if (typeof entry.particulars !== "string" || !validatorUtilities.isNotEmpty(entry.particulars)) {
    return { ok: false, error: `particulars is required at ${index}.` };
  }

  if (
    entry.accountCode !== undefined
    && entry.accountCode !== null
    && (typeof entry.accountCode !== "string" || !validatorUtilities.isNotEmpty(entry.accountCode))
  ) {
    return { ok: false, error: `accountCode must be a non-empty string at ${index}.` };
  }

  if (
    entry.estimate !== undefined
    && entry.estimate !== null
    && (typeof entry.estimate !== "string" || !validatorUtilities.isNumber(entry.estimate, false, false))
  ) {
    return { ok: false, error: `estimate must be a valid decimal string at ${index}.` };
  }

  if (
    entry.actual !== undefined
    && entry.actual !== null
    && (typeof entry.actual !== "string" || !validatorUtilities.isNumber(entry.actual, false, false))
  ) {
    return { ok: false, error: `actual must be a valid decimal string at ${index}.` };
  }

  if (
    entry.remarks !== undefined
    && entry.remarks !== null
    && (typeof entry.remarks !== "string")
  ) {
    return { ok: false, error: `remarks must be a string at ${index}.` };
  }

  if (
    entry.parentId !== undefined
    && entry.parentId !== null
    && !validatorUtilities.isUuid(entry.parentId as string)
  ) {
    return { ok: false, error: `parentId must be a valid UUID at ${index}.` };
  }

  if (entry.children !== undefined) {
    if (!Array.isArray(entry.children)) {
      return { ok: false, error: `children must be an array at ${index}.` };
    }

    for (let i = 0; i < entry.children.length; i++) {
      const childResult = await validateF4ContentItem(entry.children[i], `${index}.children[${i}]`);
      if (!childResult.ok) {
        return childResult;
      }
    }
  }

  return { ok: true };
}

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.LBAC_DATA_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const yearParam = req.nextUrl.searchParams.get("forFiscalYear");

  if (yearParam === null) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      "Query parameter 'forFiscalYear' is required.",
    ).build();
  }

  const parsedYear = parseInt(yearParam, 10);

  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      "Invalid 'forFiscalYear'. Must be an integer between 2000 and 2100.",
    ).build();
  }

  const result = await lbac.getAllF4Items(parsedYear);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<LbacF4IncomingRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<LbacF4IncomingRequest>(body, {
    properties: {
      forFiscalYear: { type: "number" },
      contents: {
        type: "object",
        formatterFn: async (v) => {
          if (!Array.isArray(v)) {
            return { ok: false, error: "contents must be an array." };
          }

          for (let i = 0; i < v.length; i++) {
            const itemResult = await validateF4ContentItem(v[i], `contents[${i}]`);
            if (!itemResult.ok) {
              return itemResult;
            }
          }

          return { ok: true };
        },
      },
    },
    requiredProperties: ["forFiscalYear", "contents"],
    allowUnvalidatedProperties: false,
  });

  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  if (!Number.isInteger(body.forFiscalYear) || body.forFiscalYear < 2000 || body.forFiscalYear > 2100) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      "Invalid 'forFiscalYear'. Must be an integer between 2000 and 2100.",
    ).build();
  }

  const result = await lbac.createF4Items(body.forFiscalYear, body.contents);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
