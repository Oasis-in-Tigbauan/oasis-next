import { session as auth, SessionCode } from "@/lib/auth";
import { getUnactivatedAccounts } from "@/lib/accounts";
import { oneOf } from "@/lib/one-of";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";

export async function GET() {
  // Session validation and retrieve account information
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  // Retrieve the list of users
  const users = await getUnactivatedAccounts();
  return oneOf(users).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
