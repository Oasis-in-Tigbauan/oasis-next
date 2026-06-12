import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

export async function GET() {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const users = await accounts.getAllAccounts();
  return oneOf(users).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateAccountPayload>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  // Validate
  const validation = await validator.validate(body, {
    properties: {
      fullName: { type: "string", formatter: "non-empty-string" },
      email: { type: "string", formatter: "email" },
      officeId: { type: "string", formatter: "uuid" },
      officePositionId: { type: "string", formatter: "uuid" },
      activated: { type: "boolean" },
    },
    requiredProperties: ["fullName", "email", "officeId", "officePositionId", "activated"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, validation.errors!)
      .build();
  }

  // Create account
  const account = await accounts.createAccount({
    fullName: body.fullName,
    email: body.email,
    officeId: body.officeId,
    officePositionId: body.officePositionId,
    activated: body.activated,
  });
  return oneOf(account).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type CreateAccountPayload = {
  fullName: string;
  email: string;
  officeId: string;
  officePositionId: string;
  activated: boolean;
}
