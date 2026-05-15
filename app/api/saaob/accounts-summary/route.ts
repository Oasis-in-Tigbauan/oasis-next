import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { oneOf } from "@/lib/one-of";
import * as saaob from "@/lib/saaob";

export async function GET() {
  const session = await auth.verify([permission.SAAOB_DATA_READ], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await saaob.getAllSummary();
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
