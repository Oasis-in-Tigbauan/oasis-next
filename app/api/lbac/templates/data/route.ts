import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import { ApiResponseBuilder, StatusCodes } from "@/lib/http/composers";
import { tryParseJson } from "@/lib/http/RequestUtilities";
import * as lbac from "@/lib/lbac";
import { Failure, oneOf } from "@/lib/one-of";

import {
  parseTemplateTypeFromBody,
  parseTemplateUploadFormData,
  readFormData,
} from "@/app/api/lbac/templates/utils";

export async function GET() {
  const session = await auth.verify([permission.LBAC_DATA_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await lbac.getMainDataTemplates();
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const formResult = await readFormData(req);
  if (formResult instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(formResult).build();
  }

  const parsed = await parseTemplateUploadFormData(formResult.value);
  if (parsed instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(parsed).build();
  }

  const result = await lbac.uploadMainDataTemplate(parsed.value);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function PATCH(req: NextRequest) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const formResult = await readFormData(req);
  if (formResult instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(formResult).build();
  }

  const parsed = await parseTemplateUploadFormData(formResult.value);
  if (parsed instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(parsed).build();
  }

  const result = await lbac.modifyMainDataTemplate(parsed.value);
  return oneOf(result).match(
    s => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(req: NextRequest) {
  const session = await auth.verify(
    [permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE],
    "and",
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<{ type?: unknown }>(req);
  if (!body) {
    return ApiResponseBuilder
      .createError(StatusCodes.Status400BadRequest, "Invalid payload.")
      .build();
  }

  const typeResult = parseTemplateTypeFromBody(body.type);
  if (typeResult instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(typeResult).build();
  }

  const result = await lbac.removeMainDataTemplate(typeResult.value);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    e => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
