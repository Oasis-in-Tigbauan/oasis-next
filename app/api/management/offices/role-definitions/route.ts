import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { permissionDescriptors } from "@/lib/office";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";

export async function GET() {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(permissionDescriptors).build();
}
