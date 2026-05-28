import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { validatorUtilities } from "@/lib/validators";
import { Failure } from "@/lib/one-of";
import { exportPurchaseOrderToBuffer } from "@/lib/purchasing/export";

export async function GET(
  _req: NextRequest,
  { params }: RouteContext<"/api/forms/purchasing/[id]/export/po">,
) {
  const session = await auth.verify([permission.PURCHASING_REQUEST_MANAGE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status404NotFound, "No such purchase order found.")
      .build();
  }

  const result = await exportPurchaseOrderToBuffer({ id });
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `purchase-order-${id}.xlsx`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
