import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator } from "@/lib/validators";
import * as saaob from "@/lib/saaob";

type UpdateSummaryGroupBody = {
  name: string;
};

export async function PATCH(req: NextRequest, { params }: RouteContext<"/api/saaob/accounts-summary/groups/[id]">) {
  const session = await auth.verify([permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;

  const body = await tryParseJson<UpdateSummaryGroupBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<UpdateSummaryGroupBody>(body, {
    properties: {
      name: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: ["name"],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const result = await saaob.updateSummaryGroup(id, body.name);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(_req: NextRequest, { params }: RouteContext<"/api/saaob/accounts-summary/groups/[id]">) {
  const session = await auth.verify([permission.SAAOB_DATA_READ, permission.SAAOB_DATA_WRITE], "and");
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;

  const result = await saaob.deleteSummaryGroup(id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status200Ok).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
