import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as expenseClasses from "@/lib/field-types/expense";
import { oneOf } from "@/lib/one-of";
import * as permissions from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";

export async function GET() {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  const data = await expenseClasses.all();
  return oneOf(data).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ResponseComposer.composeFromSessionValidation(session).orchestrate();
  }

  const body = await tryParseJson<PostPayload>(req);
  if (!body) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .orchestrate();
  }

  const validation = await validator.validate<PostPayload>(body, {
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

  const data = await expenseClasses.create(body);
  return oneOf(data).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type PostPayload = {
  accountName: string;
  fpp: Optional<string>;
  classification: Optional<string>;
  subClassification: Optional<string>;
  group: Optional<string>;
  accountCode: Optional<string>;
  class: Optional<string>;
}
