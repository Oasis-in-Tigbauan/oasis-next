import { session as auth } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { permissionDescriptors } from "@/lib/office";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";

export async function GET() {
  const sessionValidation = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!sessionValidation) {
    return ResponseComposer
      .composeError(StatusCodes.Status403Forbidden, "Forbidden.")
      .orchestrate();
  }

  return ResponseComposer.compose(StatusCodes.Status200Ok).setBody(permissionDescriptors).orchestrate();
}
