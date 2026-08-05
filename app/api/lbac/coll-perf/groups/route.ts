import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import * as lbac from '@/lib/lbac';
import {oneOf} from '@/lib/one-of';
import {validator} from '@/lib/validators';

type CreateCollPerfGroupBody = {
  name: string;
  parentId?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth.verify([permission.LBAC_DATA_READ, permission.LBAC_DATA_WRITE], 'and');
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const body = await tryParseJson<CreateCollPerfGroupBody>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<CreateCollPerfGroupBody>(body, {
    properties: {
      name: {type: 'string', formatter: 'non-empty-string'},
      parentId: {type: 'string', formatter: 'uuid'},
    },
    requiredProperties: ['name'],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await lbac.collCreateGroup(session.user!, body.name, body.parentId);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
