import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import { parseLbacQuarterlyExportColumns } from "@/common/lbac/client";
import { Failure } from "@/lib/one-of";

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.LBAC_QUARTERLY_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { searchParams } = req.nextUrl;

  const rawYear = searchParams.get("year");
  const rawQuarter = searchParams.get("quarter");
  const rawColumns = searchParams.get("columns");

  if (!rawYear || !rawQuarter) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Query parameters 'year' and 'quarter' are required.")
      .build();
  }

  const year = parseInt(rawYear, 10);
  const quarter = parseInt(rawQuarter, 10);

  if (!Number.isFinite(year) || year < 2000) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'year'.")
      .build();
  }
  if (!Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'quarter': must be 1–4.")
      .build();
  }

  if (!rawColumns) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Query parameter 'columns' is required.")
      .build();
  }

  const columns = parseLbacQuarterlyExportColumns(rawColumns);
  if (!columns || columns.length === 0) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "No valid export columns provided.")
      .build();
  }

  const restrictToOfficeId = lbac.resolveLbacOfficeRestriction(
    session.user!.office.role.permissions,
    session.user!.office.id,
  );

  const result = await lbac.exportQuarterlyToBuffer({ year, quarter, columns, restrictToOfficeId });
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `lbac-quarterly-${year}-Q${quarter}.xlsx`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
