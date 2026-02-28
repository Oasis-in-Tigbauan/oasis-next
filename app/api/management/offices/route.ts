import type { NextRequest } from "next/server";

import { session as auth } from "@/lib/auth";
import * as office from "@/lib/office";
import { oneOf } from "@/lib/one-of";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

export async function GET() {
  const sessionValidation = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!sessionValidation) {
    return ResponseComposer
      .composeError(StatusCodes.Status403Forbidden, "Forbidden.")
      .orchestrate();
  }

  const offices = await office.getAssignableOffices();
  return oneOf(offices).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function POST(req: NextRequest) {
  const sessionValidation = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!sessionValidation) {
    return ResponseComposer
      .composeError(StatusCodes.Status403Forbidden, "Forbidden.")
      .orchestrate();
  }

  const payload = await tryParseJson<{ name: string }>(req);
  if (!payload) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
  }

  const validate = await validator.validate<{ name: string }>(payload, {
    properties: {
      name: { type: "string" },
    },
    requiredProperties: ["name"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, validate.errors!)
      .orchestrate();
  }

  const result = await office.createOffice(payload.name);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
