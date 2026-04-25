import { session as auth, SessionCode } from "@/lib/auth";
import { getUnactivatedAccounts } from "@/lib/accounts";
import { oneOf } from "@/lib/one-of";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";

export async function GET() {
  // Session validation and retrieve account information
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Retrieve the list of users
  const users = await getUnactivatedAccounts();
  return oneOf(users).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
