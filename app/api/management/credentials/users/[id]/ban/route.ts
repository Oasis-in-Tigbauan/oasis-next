import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
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
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, "Not found.")
      .orchestrate();
  }

  // Disallow banning yourself
  if (session.user.id === id) {
    return ResponseComposer.composeError(
      StatusCodes.Status400BadRequest,
      "You cannot ban yourself. Or can you?",
    ).orchestrate();
  }

  const result = await accounts.toggleBan(id);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
