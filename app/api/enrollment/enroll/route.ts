import {NextRequest} from 'next/server';

import {enroll} from '@/lib/accounts';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {tryParseJson} from '@/lib/http/RequestUtilities';
import {oneOf} from '@/lib/one-of';
import {validator} from '@/lib/validators';

export async function POST(request: NextRequest) {
  const body = await tryParseJson<EnrollmentRequirements>(request);
  if (!body) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [
      {message: 'Invalid Payload.'},
    ]).build();
  }

  // Validate the request body
  const validation = await validator.validate<EnrollmentRequirements>(body, {
    properties: {
      fullName: {
        type: 'string',
        formatter: 'non-empty-string',
      },
      password: {
        type: 'string',
        formatter: 'strong-password',
      },
      token: {
        type: 'string',
        formatter: 'non-empty-string',
      },
    },
    requiredProperties: ['fullName', 'password', 'token'],
    allowUnvalidatedProperties: false,
  });
  if (!validation.ok) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      validation.errors!,
    ).build();
  }

  // Enrollment
  const result = await enroll(body);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}

type EnrollmentRequirements = {
  fullName: string;
  token: string;
  password: string;
};
