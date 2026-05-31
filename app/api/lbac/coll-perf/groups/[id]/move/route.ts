import type { NextRequest } from "next/server";
import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import * as lbac from "@/lib/lbac";
import { oneOf } from "@/lib/one-of";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import { validator, validatorUtilities } from "@/lib/validators";

type MoveCollPerfGroupBody = {
  parentId: string | null;
};

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/lbac/coll-perf/groups/[id]/move">,
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
    return ApiResponseBuilder.createError(StatusCodes.Status404NotFound, "No such group found.").build();
  }

  const body = await tryParseJson<MoveCollPerfGroupBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "Invalid payload.").build();
  }

  if (!("parentId" in body)) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, "parentId is required.").build();
  }

  if (body.parentId !== null && body.parentId !== undefined) {
    const validate = await validator.validate<Pick<MoveCollPerfGroupBody, "parentId">>(body, {
      properties: {
        parentId: { type: "string", formatter: "uuid" },
      },
      requiredProperties: ["parentId"],
      allowUnvalidatedProperties: false,
    });
    if (!validate.ok) {
      return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, validate.errors!).build();
    }
  }

  const result = await lbac.collMoveGroup(id, body.parentId ?? undefined);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
