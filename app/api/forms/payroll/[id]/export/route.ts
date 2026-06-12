import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as payroll from "@/lib/forms/payroll";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { Failure } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

type PayrollExportRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: PayrollExportRouteContext) {
  const session = await auth.verify();
  if (session.code !== SessionCode.Ok || !session.user) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payroll ID.")
      .build();
  }

  const result = await payroll.exportPayrollToExcelBuffer(id);
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `payroll-${id}.xlsx`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
