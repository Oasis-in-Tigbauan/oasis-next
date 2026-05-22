import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as saaob from "@/lib/saaob";
import { parseSaaobExportColumns } from "@/lib/saaob/client";
import { Failure } from "@/lib/one-of";

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.SAAOB_OFFICE_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const rawColumns = req.nextUrl.searchParams.get("columns");
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

  const result = await saaob.exportOfficeDataToBuffer(session.user!.office.id, columns);
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"saaob-office-export.xlsx\"",
    },
  });
}
