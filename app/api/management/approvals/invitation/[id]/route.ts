import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { oneOf } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

export async function DELETE(
  req: NextRequest,
  { params }: RouteContext<"/api/management/approvals/invitation/[id]">,
) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Get ID from parameter
  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid ID.")
      .build();
  }

  // Attempt to delete
  const result = await accounts.revokeInvitation(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext<"/api/management/approvals/invitation/[id]">,
) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status403Forbidden, "Forbidden")
      .build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid ID.")
      .build();
  }

  const result = await accounts.resendInvitation(id);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody({ errors: s.errors, sent: !Boolean(s.errors) })
      .build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
