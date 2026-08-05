import * as Sentry from '@sentry/nextjs';
import {headers} from 'next/headers';
import {NextRequest} from 'next/server';

import {auth, session, SessionCode} from '@/lib/auth';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {validator} from '@/lib/validators';

export async function POST(req: NextRequest) {
  const getSession = await session.verify();

  // No session
  if (!getSession || getSession.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(getSession).build();
  }

  const body = await tryParseJson<ChangePasswordRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid request payload.',
    ).build();
  }

  const validation = await validator.validate<ChangePasswordRequest>(body, {
    properties: {
      oldPassword: {type: 'string', formatter: 'non-empty-string'},
      newPassword: {type: 'string', formatter: 'non-empty-string'},
    },
    requiredProperties: ['oldPassword', 'newPassword'],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validation.errors!,
    ).build();
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: body.oldPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });

    return ApiResponseBuilder.create(StatusCodes.Status204NoContent).build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder.createError(
      StatusCodes.Status500InternalServerError,
      'Unable to change the password due to an internal error',
    ).build();
  }
}

type ChangePasswordRequest = {
  oldPassword: string;
  newPassword: string;
};
