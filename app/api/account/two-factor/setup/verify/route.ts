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

  const body = await tryParseJson<TwoFactorSetupVerifyRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid Payload.")
      .build();
  }

  const validation = await validator.validate<TwoFactorSetupVerifyRequest>(body, {
    properties: {
      code: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["code"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  try {
    const requestHeaders = await headers();

    await auth.api.verifyTOTP({
      body: {
        code: body.code,
      },
      headers: requestHeaders,
    });

    const backupCodesResult = await auth.api.viewBackupCodes({
      body: {
        userId: getSession.user!.id,
      },
      headers: requestHeaders,
    });

    return ApiResponseBuilder.create(StatusCodes.Status200Ok)
      .withBody({
        backupCodes: backupCodesResult.backupCodes ?? [],
      })
      .build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder.createError(StatusCodes.Status401Unauthorized, "Invalid verification code.")
      .build();
  }
}

type TwoFactorSetupVerifyRequest = {
  code: string;
};
