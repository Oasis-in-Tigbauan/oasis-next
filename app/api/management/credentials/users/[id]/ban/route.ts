import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { validatorUtilities } from "@/lib/validators";
import { oneOf } from "@/lib/one-of";

export async function POST(
  req: NextRequest,
  { params }: RouteContext<"/api/management/credentials/users/[id]/ban">,
) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "Not found.")
      .build();
  }

  // Disallow banning yourself
  if (session.user!.id === id) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      "You cannot ban yourself. Or can you?",
    ).build();
  }

  const result = await accounts.toggleBan(id);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
