import {NextRequest} from 'next/server';

import {getEligibility} from '@/lib/accounts';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {oneOf} from '@/lib/one-of';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.get('token');
  if (!params) {
    return ApiResponseBuilder.createError(StatusCodes.Status400BadRequest, [
      {
        message: 'Missing token parameter.',
      },
    ]).build();
  }

  // Validate token against the database
  const eligibility = await getEligibility(params);
  return oneOf(eligibility).match(
    (success) => {
      return ApiResponseBuilder.create(StatusCodes.Status200Ok)
        .withBody({
          id: success.id,
          token: success.token,
        })
        .build();
    },
    (err) => ApiResponseBuilder.createFromFailure(err).build(),
  );
}
