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

  const searchParams = new URL(req.url).searchParams;
  const format = searchParams.get("format");
  const isPdf = format === "pdf";
  const printOptions = {
    leftName: searchParams.get("leftName")?.trim() || undefined,
    leftPosition: searchParams.get("leftPosition")?.trim() || undefined,
    leftDate: searchParams.get("leftDate")?.trim() || undefined,
    rightName: searchParams.get("rightName")?.trim() || undefined,
    rightPosition: searchParams.get("rightPosition")?.trim() || undefined,
    rightDate: searchParams.get("rightDate")?.trim() || undefined,
  };
  const result = isPdf
    ? await obr.exportObrRequestFormToPdfBuffer(id, session.user!, printOptions)
    : await obr.exportObrRequestFormToBuffer(id, session.user!);
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `obr-request-${id}.${isPdf ? "pdf" : "xlsx"}`;
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
