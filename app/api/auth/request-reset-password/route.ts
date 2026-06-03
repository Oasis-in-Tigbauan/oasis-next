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
      email: { type: "string", formatter: "email" },
    },
    requiredProperties: ["email"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  try {
    const result = await auth.api.requestPasswordReset({
      body: {
        email: body.email,
      },
    });

    return ApiResponseBuilder
      .create(StatusCodes.Status200Ok)
      .withBody({ message: result.message })
      .build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid request")
      .build();
  }
}

type ResetPasswordRequest = {
  email: string;
}
