import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as officeCodes from "@/lib/field-types/offices";
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

  const data = await officeCodes.all();
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
      aa: { type: "string", formatter: "non-empty-string" },
      code: { type: "string", formatter: "non-empty-string" },
      sector: { type: "string", formatter: "non-empty-string" },
      function: { type: "string", formatter: "non-empty-string" },
      liftOffice: { type: "string", formatter: "non-empty-string" },
      subOffice: { type: "string", formatter: "non-empty-string" },
      office: { type: "string", formatter: "non-empty-string" },
      headUser: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["aa"],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
  }

  const data = await officeCodes.create(body);
  return oneOf(data).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type PostPayload = {
  aa: string;
  code: Optional<string>;
  sector: Optional<string>;
  function: Optional<string>;
  liftOffice: Optional<string>;
  subOffice: Optional<string>;
  office: Optional<string>;
  headUser: Optional<string>;
}
