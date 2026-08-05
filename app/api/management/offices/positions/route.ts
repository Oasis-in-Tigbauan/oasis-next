import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import * as office from '@/lib/office';
import {oneOf} from '@/lib/one-of';
import {validatorUtilities} from '@/lib/validators';

export async function GET(req: NextRequest) {
  const session = await auth.verify([
    permission.APPROVALS_ACCOUNT_READ,
    permission.APPROVALS_ACCOUNT_WRITE,
  ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  // Parameters
  const officeId = req.nextUrl.searchParams.get('oId');
  if (!validatorUtilities.isNotEmpty(officeId) || !validatorUtilities.isUuid(officeId)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'Invalid Office ID supplied.',
    ).build();
  }

  // Retrieve the list of users
  const positions = await office.getAssignableRoles(officeId!);
  return oneOf(positions).match(
    (s) => {
      const v = s.map((i) => ({id: i.id, name: i.name}));
      return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(v).build();
    },
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
