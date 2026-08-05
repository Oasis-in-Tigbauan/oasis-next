import * as Sentry from '@sentry/nextjs';
import {NextRequest} from 'next/server';

import {auth} from '@/lib/auth';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import * as turnstile from '@/lib/turnstile';
import {validator} from '@/lib/validators';

export async function POST(req: NextRequest) {
  const body = await tryParseJson<SignInRequest>(req);
  if (!body) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid Payload.',
    ).build();
  }

  const validation = await validator.validate<SignInRequest>(body, {
    properties: {
      email: {type: 'string', formatter: 'email'},
      password: {type: 'string', formatter: 'non-empty-string'},
      rememberMe: {type: 'boolean'},
      token: {type: 'string', formatter: 'non-empty-string'},
    },
    requiredProperties: ['email', 'password'],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validation.errors!,
    ).build();
  }

  try {
    // Verify turnstile
    const turnstileRawResult = await turnstile.validate(body.token);
    const turnstileResult = oneOf(turnstileRawResult).match(
      (s) => s,
      () => false,
    );

    if (!turnstileResult) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status401Unauthorized,
        'Invalid Token!',
      ).build();
    }

    const response = await auth.api.signInEmail({
      body: {
        email: body.email,
        password: body.password,
        rememberMe: body.rememberMe ?? false,
      },
    });

    if ('twoFactorRedirect' in response) {
      return ApiResponseBuilder.create(StatusCodes.Status200Ok)
        .withBody({twoFactorRequired: true})
        .build();
    }

    return ApiResponseBuilder.create(StatusCodes.Status204NoContent).build();
  } catch (e) {
    Sentry.captureException(e);

    return ApiResponseBuilder.createError(
      StatusCodes.Status401Unauthorized,
      'Invalid credentials',
    ).build();
  }
}

type SignInRequest = {
  email: string;
  password: string;
  rememberMe?: boolean;
  token: string;
};
