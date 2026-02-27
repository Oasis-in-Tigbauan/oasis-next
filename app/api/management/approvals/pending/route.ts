import { getUnactivatedAccounts } from "@/lib/accounts";
import { oneOf } from "@/lib/one-of";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { session } from "@/lib/auth";

export async function GET() {
  // Session validation and retrieve account information
  const sessionValidation = await session.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!sessionValidation) {
    return ResponseComposer.composeError(StatusCodes.Status401Unauthorized, "Unauthorized").orchestrate();
  }

  // Retrieve the list of users
  const users = await getUnactivatedAccounts();
  return oneOf(users).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
