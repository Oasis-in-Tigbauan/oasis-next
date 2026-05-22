import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as saaob from "@/lib/saaob";
import { parseSaaobExportColumns } from "@/lib/saaob/client";
import { Failure } from "@/lib/one-of";

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.SAAOB_DATA_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { searchParams } = req.nextUrl;

  const rawYear = searchParams.get("year");
  const rawMonth = searchParams.get("month");
  const rawColumns = searchParams.get("columns");

  if (!rawYear || !rawMonth) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Query parameters 'year' and 'month' are required.")
      .build();
  }

  const year = parseInt(rawYear, 10);
  const month = parseInt(rawMonth, 10);

  if (!Number.isFinite(year) || year < 2000) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'year'.")
      .build();
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid 'month': must be 1–12.")
      .build();
  }

  if (!rawColumns) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Query parameter 'columns' is required.")
      .build();
  }

  const columns = parseSaaobExportColumns(rawColumns);
  if (!columns || columns.length === 0) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "No valid export columns provided.")
      .build();
  }

  const result = await saaob.exportMainDataToBuffer({ year, month, columns });
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `saaob-data-${year}-${String(month).padStart(2, "0")}.xlsx`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
