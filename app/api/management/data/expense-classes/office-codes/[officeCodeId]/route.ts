import { session as auth, SessionCode } from "@/lib/auth";
import * as expenseClassService from "@/lib/field-types/expense";
import { oneOf } from "@/lib/one-of";
import * as permissions from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { validatorUtilities } from "@/lib/validators";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/management/data/expense-classes/office-codes/[officeCodeId]">,
) {
  const session = await auth.verify([permissions.DATA_TYPES_MANAGE_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { officeCodeId } = await params;
  if (!validatorUtilities.isUuid(officeCodeId)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "Not found.").build();
  }

  const data = await expenseClassService.getAllByOfficeCode(officeCodeId);
  return oneOf(data).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
