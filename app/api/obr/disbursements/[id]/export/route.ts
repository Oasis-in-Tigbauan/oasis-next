import { NextResponse } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder } from "@/lib/http/composers";
import * as obr from "@/lib/obr";
import { Failure } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.verify([
    permission.OBR_DISBURSEMENT_CREATE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(404, "No such disbursement voucher found.").build();
  }

  const format = new URL(req.url).searchParams.get("format");
  const isPdf = format === "pdf";
  const result = isPdf
    ? await obr.exportDisbursementVoucherToPdfBuffer(id, session.user!)
    : await obr.exportDisbursementVoucherToBuffer(id, session.user!);
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `disbursement-voucher-${id}.${isPdf ? "pdf" : "xlsx"}`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": isPdf
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
