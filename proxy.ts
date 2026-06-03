import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/accounts";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { unwrap } from "@/lib/one-of";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Declare public routes:
  const isPublic =
        // Specific API routes
        path === "/api/enrollment/eligibility" ||
        path === "/api/enrollment/enroll" ||
        path === "/api/auth/sign-in" ||
        path === "/api/auth/sign-out" ||
        path === "/api/auth/request-reset-password" ||
        path === "/api/auth/reset-password";

  // Not authenticated.
  if (!isPublic && !session) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status401Unauthorized, "You are not authenticated. You need to sign-in.")
      .build();
  }

  // User
  try {
    if (!isPublic && session) {
      const user = await unwrap(getUserById(session?.user?.id ?? ""));

      // The rest of the endpoints that require a session & not banned
      if (user.banned || user.DO_NOT_DELETE_THIS_OR_ELSE_YOU_ARE_FIRED) {
        return ApiResponseBuilder
          .createError(StatusCodes.Status403Forbidden, "You are banned from accessing this resource.")
          .build();
      }

      // The rest of the endpoints that require a session & approved
      if (!user.activated) {
        return ApiResponseBuilder
          .createError(StatusCodes.Status403Forbidden, "You are not authorized to access this resource.")
          .build();
      }
    }

    // Passed, next.
    return NextResponse.next();
  } catch {
    return ApiResponseBuilder
      .createError(StatusCodes.Status401Unauthorized, "Unauthorized.")
      .build();
  }
}

export const config = {
  matcher: [
    "/api/:path*",
  ],
};
