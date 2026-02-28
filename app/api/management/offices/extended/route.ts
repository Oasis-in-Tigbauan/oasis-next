import { getOfficesExtendedInformation } from "@/lib/office";
import { session } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { oneOf } from "@/lib/one-of";

export async function GET() {
  const sessionValidation = await session.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!sessionValidation) {
    return ResponseComposer
      .composeError(StatusCodes.Status403Forbidden, "Forbidden.")
      .orchestrate();
  }

  const offices = await getOfficesExtendedInformation();
  return oneOf(offices).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
