import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as officeCodes from "@/lib/field-types/offices";
import { oneOf } from "@/lib/one-of";
import * as permissions from "@/lib/db/permissions";
import { ResponseComposer, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: RouteContext<"/api/management/data/office-codes/[id]">) {
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
      aa: { type: "string", formatter: "non-empty-string" },
      code: { type: "string", formatter: "non-empty-string" },
      sector: { type: "string", formatter: "non-empty-string" },
      function: { type: "string", formatter: "non-empty-string" },
      liftOffice: { type: "string", formatter: "non-empty-string" },
      subOffice: { type: "string", formatter: "non-empty-string" },
      office: { type: "string", formatter: "non-empty-string" },
      headUser: { type: "string", formatter: "non-empty-string" },
      applyToExisting: { type: "boolean" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ResponseComposer.composeError(StatusCodes.Status400BadRequest, validation.errors!)
      .orchestrate();
  }

  const data = await officeCodes.update(id, {
    aa: body.aa ?? undefined,
    code: body.code,
    sector: body.sector,
    function: body.function,
    liftOffice: body.liftOffice,
    subOffice: body.subOffice,
    office: body.office,
    headUser: body.headUser,
  }, { applyToExisting: body.applyToExisting ?? false });
  return oneOf(data).match(
    s => ResponseComposer.compose(StatusCodes.Status200Ok).setBody(s).orchestrate(),
    e => ResponseComposer.composeFromFailure(e).orchestrate(),
  );
}

type PatchPayload = Partial<{
  aa: Optional<string>;
  code: Optional<string>;
  sector: Optional<string>;
  function: Optional<string>;
  liftOffice: Optional<string>;
  subOffice: Optional<string>;
  office: Optional<string>;
  headUser: Optional<string>;
  applyToExisting: Optional<boolean>;
}>;
