import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { oneOf } from "@/lib/one-of";
import * as notifications from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 12;
  const result = await notifications.listNotificationsForUser(
    session.user!.id,
    Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 12,
  );

  return oneOf(result).match(
    (data) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(data).build(),
    (error) => ApiResponseBuilder.createFromFailure(error).build(),
  );
}
