import { headers } from "next/headers";
import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { auth, session, SessionCode } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

export async function POST(req: NextRequest) {
  const getSession = await session.verify();

  if (!getSession || getSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder
      .createFromSessionValidation(getSession)
      .build();
  }

  const body = await tryParseJson<TwoFactorSetupRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid Payload.")
      .build();
  }

  const validation = await validator.validate<TwoFactorSetupRequest>(body, {
    properties: {
      password: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["password"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  try {
    const result = await auth.api.enableTwoFactor({
      body: {
        password: body.password,
      },
      headers: await headers(),
    });

    return ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody({
        totpURI: result.totpURI,
      })
      .build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder.createError(StatusCodes.Status401Unauthorized, "Invalid password.")
      .build();
  }
}

type TwoFactorSetupRequest = {
  password: string;
};
