import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { oneOf } from "@/lib/one-of";
import * as office from "@/lib/office";

export async function GET() {
  const session = await auth.verify([permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await office.getAssignableOffices();
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
