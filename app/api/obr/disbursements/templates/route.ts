import type {NextRequest} from 'next/server';

import {parseTemplateUploadFormData, readFormData} from '@/app/api/lbac/templates/utils';
import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import * as obr from '@/lib/obr';
import {Failure, oneOf} from '@/lib/one-of';

export async function GET() {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_CREATE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await obr.getObrDvFormTemplates();
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_CREATE]);
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

  const result = await obr.uploadObrDvFormTemplate(parsed.value);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function PATCH(req: NextRequest) {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_CREATE]);
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

  const result = await obr.modifyObrDvFormTemplate(parsed.value);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function DELETE(req: NextRequest) {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_CREATE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<{type?: unknown}>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const typeResult = obr.parseObrTemplateType(body.type);
  if (typeResult instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(typeResult).build();
  }

  const result = await obr.removeObrDvFormTemplate(typeResult.value);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status204NoContent).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
