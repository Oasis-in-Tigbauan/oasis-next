import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { auth } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

export async function POST(req: NextRequest) {
  const body = await tryParseJson<SignInRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid Payload.")
      .build();
  }

  const validation = await validator.validate<SignInRequest>(body, {
    properties: {
      email: { type: "string", formatter: "email" },
      password: { type: "string", formatter: "non-empty-string" },
      rememberMe: { type: "boolean" },
    },
    requiredProperties: ["email", "password"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  try {
    await auth.api.signInEmail({
      body: {
        email: body.email,
        password: body.password,
        rememberMe: body.rememberMe ?? false,
      },
    });

    return ApiResponseBuilder.create(StatusCodes.Status204NoContent).build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder.createError(StatusCodes.Status401Unauthorized, "Invalid credentials")
      .build();
  }
}

type SignInRequest = {
    email: string;
    password: string;
    rememberMe?: boolean;
}
