import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import { oneOf } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";
import * as permission from "@/lib/db/permissions";

export async function GET(req: NextRequest) {
  const session = await auth.verify([
    permission.LBAC_OFFICE_READ,
    permission.LBAC_DATA_READ,
    permission.PURCHASING_REQUEST_CREATE,
    permission.PURCHASING_REQUEST_MANAGE,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const query = req.nextUrl.searchParams.get("query");
  if (!query || !validatorUtilities.isNotEmpty(query)) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "A non-empty query parameter is required.").build();
  }

  const result = await lbac.searchLbacItems(query);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
