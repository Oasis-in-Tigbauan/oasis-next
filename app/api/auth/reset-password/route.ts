import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { auth } from "@/lib/auth";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

export async function POST(req: NextRequest) {
  // Reset password
  const body = await tryParseJson<ResetPasswordRequest>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid Payload.")
      .build();
  }

  const validation = await validator.validate<ResetPasswordRequest>(body, {
    properties: {
      password: { type: "string", formatter: "strong-password" },
      token: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["password", "token"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  try {
    const result = await auth.api.resetPassword({
      body: {
        newPassword: body.password,
        token: body.token,
      },
    });

    if (result.status) {
      return ApiResponseBuilder
        .create(StatusCodes.Status200Ok)
        .withBody({ message: "Password has been reset. Try logging-in." })
        .build();
    }

    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid request")
      .build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid request")
      .build();
  }
}

type ResetPasswordRequest = {
  password: string;
  token: string;
}
