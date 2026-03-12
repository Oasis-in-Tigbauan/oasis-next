import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as offices from "@/lib/office";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { validator, validatorUtilities } from "@/lib/validators";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";

export async function GET(
  req: NextRequest,
  { params }: RouteContext<"/api/management/offices/[id]">,
) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, "Not found.")
      .orchestrate();
  }

  const result = await offices.getOfficeInformationById(id);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/management/offices/[id]">,
) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, "Not found.")
      .orchestrate();
  }

  const body = await tryParseJson<{ name: string }>(req);
  if (!body) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
  }

  // Validation
  const validate = await validator.validate<{ name: string }>(body, {
    properties: {
      name: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["name"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, validate.errors!)
      .orchestrate();
  }

  const result = await offices.updateOffice(id, body.name);
  return oneOf(result).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
