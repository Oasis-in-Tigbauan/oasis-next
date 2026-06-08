import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { Failure } from "@/lib/one-of";
import { exportPurchaseRequestToBuffer } from "@/lib/purchasing/export";
import { validatorUtilities } from "@/lib/validators";

export async function GET(req: NextRequest) {
  const session = await auth.verify([
    permission.PURCHASING_REQUEST_CREATE,
    permission.PURCHASING_REQUEST_MANAGE,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such purchase request item found.")
      .build();
  }

  const result = await exportPurchaseRequestToBuffer({ id });
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `Purchase_Request_${id}.xlsx`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
