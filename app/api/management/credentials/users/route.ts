import * as accounts from "@/lib/accounts";
import { session as auth } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { oneOf } from "@/lib/one-of";

export async function GET() {
  const session = auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session) {
    return ResponseComposer.composeError(StatusCodes.Status403Forbidden, "Forbidden")
      .orchestrate();
  }

  const users = await accounts.getAllAccounts();
  return oneOf(users).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
