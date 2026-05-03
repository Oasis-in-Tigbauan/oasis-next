import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as obr from "@/lib/obr";
import { oneOf } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

export async function GET(req: Request) {
  const session = await auth.verify([
    permission.OBR_MANAGEMENT_READ,
    permission.ESRE_READ,
  ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim() ?? "";

  if (!validatorUtilities.isNotEmpty(query)) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Query is required.")
      .build();
  }

  const result = await obr.searchObrItems(query);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
