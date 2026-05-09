import { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as obr from "@/lib/obr";
import { oneOf } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const session = await auth.verify([
    permission.OBR_DISBURSEMENT_CREATE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const searchParams = request.nextUrl.searchParams;
  const filter = searchParams.get("filter");

  // Filter is not empty.
  if (!validatorUtilities.isNotEmpty(filter)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Filter cannot be empty.")
      .build();
  }

  // Normalize and check
  const value = filter!.toLowerCase();
  if (
    value !== "obr.disbursement.mayor.approve" &&
    value !== "obr.disbursement.accountant.approve" &&
    value !== "obr.disbursement.treasurer.approve"
  ) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid filter.")
      .build();
  }

  // Get the list of the requests
  const users = await obr.getValidUsersAsApprovers(
    filter as obr.ValidApproverPermissionType,
  );
  return oneOf(users).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
