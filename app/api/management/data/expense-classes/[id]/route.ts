import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as expenseClasses from "@/lib/field-types/expense";
import { oneOf } from "@/lib/one-of";
import * as permissions from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: RouteContext<"/api/management/data/expense-classes/[id]">) {
  const session = await auth.verify([
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  const { id } = await params;
  if (!validatorUtilities.isNotEmpty(id)) {
    return ResponseComposer.composeError(StatusCodes.Status404NotFound, "Not found.")
      .orchestrate();
  }

  const body = await tryParseJson<PatchPayload>(req);
  if (!body) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
  }

  const validation = await validator.validate<PatchPayload>(body, {
    properties: {
      accountName: { type: "string", formatter: "non-empty-string" },
      fpp: { type: "string", formatter: "non-empty-string" },
      classification: { type: "string", formatter: "non-empty-string" },
      subClassification: { type: "string", formatter: "non-empty-string" },
      group: { type: "string", formatter: "non-empty-string" },
      accountCode: { type: "string", formatter: "non-empty-string" },
      class: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
  }

  const data = await expenseClasses.update(id, body);
  return oneOf(data).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type PatchPayload = Partial<{
  accountName: string;
  fpp: Optional<string>;
  classification: Optional<string>;
  subClassification: Optional<string>;
  group: Optional<string>;
  accountCode: Optional<string>;
  class: Optional<string>;
}>
