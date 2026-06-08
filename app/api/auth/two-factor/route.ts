import { headers } from "next/headers";
import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { auth } from "@/lib/auth";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

export async function POST(req: NextRequest) {
  const body = await tryParseJson<TwoFactorVerifyRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid Payload.")
      .build();
  }

  const validation = await validator.validate<TwoFactorVerifyRequest>(body, {
    properties: {
      code: { type: "string", formatter: "non-empty-string" },
      trustDevice: { type: "boolean" },
    },
    requiredProperties: ["code"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  try {
    await auth.api.verifyTOTP({
      body: {
        code: body.code,
        trustDevice: body.trustDevice ?? false,
      },
      headers: await headers(),
    });

    return ApiResponseBuilder.create(StatusCodes.Status204NoContent).build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder.createError(StatusCodes.Status401Unauthorized, "Invalid verification code.")
      .build();
  }
}

type TwoFactorVerifyRequest = {
  code: string;
  trustDevice?: boolean;
};
