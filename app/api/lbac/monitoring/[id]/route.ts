import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import * as lbac from "@/lib/lbac";
import { oneOf } from "@/lib/one-of";
import { validator, validatorUtilities } from "@/lib/validators";

type UpdateMonitoringBody = Partial<{
  ab: string | null;
  actualAccomplishment: string | null;
  abEstimatedCost: string | null;
  actualExpenditure: string | null;
  remarks: string | null;
}>;

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/lbac/monitoring/[id]">,
) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const { id } = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "No such monitoring item found.").build();
  }

  const body = await tryParseJson<UpdateMonitoringBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  const validate = await validator.validate<UpdateMonitoringBody>(body, {
    properties: {
      ab: { type: "string", formatter: "non-empty-string" },
      actualAccomplishment: { type: "string", formatter: "non-empty-string" },
      abEstimatedCost: { type: "string", formatter: "decimal" },
      actualExpenditure: { type: "string", formatter: "decimal" },
      remarks: { type: "string", formatter: "non-empty-string" },
    },
    requiredProperties: [],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
  }

  const result = await lbac.updateMonitoringItem(id, body);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
