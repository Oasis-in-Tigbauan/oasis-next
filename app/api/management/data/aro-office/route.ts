import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permissions from '@/lib/db/permissions';
import * as aro from '@/lib/field-types/aro';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator} from '@/lib/validators';

export async function GET() {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const data = await aro.all();
  return oneOf(data).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth.verify([
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<PostPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validation = await validator.validate<PostPayload>(body, {
    properties: {
      name: {type: 'string', formatter: 'non-empty-string'},
      code: {type: 'string', formatter: 'non-empty-string'},
      description: {type: 'string', formatter: 'non-empty-string'},
      leadUserId: {type: 'string', formatter: 'non-empty-string'},
    },
    requiredProperties: ['name', 'code', 'description', 'leadUserId'],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validation.errors!,
    ).build();
  }

  const data = await aro.create(body);
  return oneOf(data).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type PostPayload = {
  name: string;
  code: string;
  description: string;
  leadUserId: string;
};
