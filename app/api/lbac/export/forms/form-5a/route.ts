import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import { Failure } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.LBAC_DATA_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { searchParams } = req.nextUrl;
  const rawYear = searchParams.get("year");
  const rawQuarter = searchParams.get("quarter");
  const aroLink = searchParams.get("aroLink");
  const lgu = searchParams.get("lgu");
  const mfo = searchParams.get("mfo");

  if (!rawYear || !rawQuarter || !aroLink || !lgu || !mfo) {
    return ApiResponseBuilder
      .createError(
        StatusCodes.Status400BadRequest,
        "Query parameters 'year', 'quarter', 'aroLink', 'lgu', and 'mfo' are required.",
      )
      .build();
  }

  const year = Number.parseInt(rawYear, 10);
  const quarter = Number.parseInt(rawQuarter, 10);

  if (!Number.isFinite(year) || year < 2000) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid 'year'.").build();
  }
  if (!Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'quarter': must be 1-4.")
      .build();
  }
  if (!validatorUtilities.isUuid(aroLink)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'aroLink'.")
      .build();
  }
  if (!lgu.trim()) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'lgu'.")
      .build();
  }
  if (!mfo.trim()) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'mfo'.")
      .build();
  }

  const result = await lbac.exportForm5AToBuffer({
    year,
    quarter,
    aroLink,
    lgu: lgu.trim(),
    mfo: mfo.trim(),
  });
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `lbe-form-5a-${year}-Q${quarter}.xlsx`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
