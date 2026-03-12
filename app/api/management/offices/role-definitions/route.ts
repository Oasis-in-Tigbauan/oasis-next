import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { permissionDescriptors } from "@/lib/office";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";

export async function GET() {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  return ResponseComposer.compose(StatusCodes.Status200Ok).setBody(permissionDescriptors).orchestrate();
}
