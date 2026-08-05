import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import * as travelOrder from '@/lib/forms/travel-order';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {oneOf} from '@/lib/one-of';

export async function GET(req: NextRequest) {
  const session = await auth.verify(
    [permission.TRAVEL_READ, permission.TRAVEL_WRITE, permission.TRAVEL_APPROVER],
    'or',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const q = req.nextUrl.searchParams.get('q') ?? '';

  const result = await travelOrder.searchUsers(q);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
