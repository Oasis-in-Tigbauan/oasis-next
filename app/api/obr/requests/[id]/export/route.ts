import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder } from "@/lib/http/composers";
import * as obr from "@/lib/obr";
import { Failure } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([
    permission.OBR_APPROVER_BASIC_READ,
    permission.OBR_APPROVER_BASIC_HIGH_WRITE,
    permission.OBR_APPROVER_ADVANCED_READ,
    permission.OBR_REQUEST_READ,
    permission.OBR_MANAGEMENT_READ,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(404, "No such request found.").build();
  }

  const result = await obr.exportObrRequestFormToBuffer(id, session.user!);
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `obr-request-${id}.xlsx`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
