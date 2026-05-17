import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as aipService from "@/lib/aip";
import { oneOf } from "@/lib/one-of";

export async function GET(request: Request) {
  const session = await auth.verify(
    [
      permission.AIP_READ,
      permission.OBR_MANAGEMENT_READ,
      permission.SUPPLEMENTAL_READ,
      permission.PURCHASING_REQUEST_CREATE,
      permission.PURCHASING_REQUEST_MANAGE,
    ], "or");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";

  const result = await aipService.searchAipCode(query);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
