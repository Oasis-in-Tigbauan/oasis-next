import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as obr from "@/lib/obr";
import { oneOf } from "@/lib/one-of";

export async function GET() {
  const session = await auth.verify([
    permission.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await obr.listPendingDisbursementsForAccountant(session.user!);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
