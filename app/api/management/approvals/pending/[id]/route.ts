import type { NextRequest } from "next/server";

import * as accounts from "@/lib/accounts";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { validator, validatorUtilities } from "@/lib/validators";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { oneOf } from "@/lib/one-of";

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/management/approvals/pending/[id]">,
) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  // Get ID from parameter
  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, "Invalid ID.")
      .orchestrate();
  }

  // Validate the body
  const body = await tryParseJson<{ accept: boolean }>(req);
  if (!body) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
  }

  const validation = await validator.validate<{ accept: boolean }>(body, {
    properties: {
      accept: { type: "boolean" },
    },
    requiredProperties: ["accept"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer
      .composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
  }

  const result = body.accept
    ? (await accounts.approveUser(id))
    : (await accounts.rejectUser(id));
  return oneOf(result).match(
    () => ResponseComposer.compose(StatusCodes.Status204NoContent).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}
