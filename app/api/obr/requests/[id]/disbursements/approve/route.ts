import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import * as obr from '@/lib/obr';
import {oneOf} from '@/lib/one-of';
import {validator, validatorUtilities} from '@/lib/validators';

export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  const session = await auth.verify([permission.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status404NotFound,
      'No such item found.',
    ).build();
  }

  const body = await tryParseJson<ApproveDisbursementsPayload>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid payload.',
    ).build();
  }

  const validate = await validator.validate<ApproveDisbursementsPayload>(body, {
    properties: {
      status: {
        type: 'string',
        formatterFn: async (s) => {
          if (s !== 'pending' && s !== 'approved' && s !== 'binned') {
            return {ok: false, error: 'Invalid status.'};
          }
          return {ok: true};
        },
      },
      reason: {type: 'string', formatter: 'non-empty-string'},
    },
    requiredProperties: ['status'],
    allowUnvalidatedProperties: false,
  });
  if (!validate.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validate.errors!,
    ).build();
  }

  const result = await obr.approveDisbursementsForRequest(
    id,
    session.user!,
    body.status,
    body.reason,
  );
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type ApproveDisbursementsPayload = {
  status: 'pending' | 'approved' | 'binned';
  reason?: string;
};
