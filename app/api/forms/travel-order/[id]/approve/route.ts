import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import * as travelOrder from '@/lib/forms/travel-order';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {oneOf} from '@/lib/one-of';
import {validatorUtilities} from '@/lib/validators';

export async function POST(
  _req: NextRequest,
  {params}: RouteContext<'/api/forms/travel-order/[id]/approve'>,
) {
  const session = await auth.verify([permission.TRAVEL_APPROVER]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  if (!validatorUtilities.isUuid(id)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid travel order ID.',
    ).build();
  }

  const result = await travelOrder.approveTravelOrder(id, session.user!);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
