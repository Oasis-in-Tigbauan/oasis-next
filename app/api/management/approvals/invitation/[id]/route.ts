import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
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
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  // Get ID from parameter
  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, "Invalid ID.")
      .orchestrate();
  }

  // Attempt to delete
  const result = await accounts.revokeInvitation(id);
  return oneOf(result).match(
    () => ResponseComposer.compose(StatusCodes.Status204NoContent).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
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
    return ResponseComposer
      .composeError(StatusCodes.Status403Forbidden, "Forbidden")
      .orchestrate();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, "Invalid ID.");
  }

  const result = await accounts.resendInvitation(id);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok)
      .setBody({ errors: s.errors, sent: !Boolean(s.errors) })
      .orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
