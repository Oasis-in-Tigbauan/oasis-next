import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {oneOf} from '@/lib/one-of';
import * as saaob from '@/lib/saaob';
import {validatorUtilities} from '@/lib/validators';

export async function GET(req: NextRequest) {
  const session = await auth.verify(
    [
      permission.ESRE_READ,
      permission.LBAC_DATA_READ,
      permission.SUPPLEMENTAL_READ,
      permission.SAAOB_DATA_READ,
      permission.SAAOB_OFFICE_READ,
    ],
    'or',
  );
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const query = req.nextUrl.searchParams.get('query');
  if (!query || !validatorUtilities.isNotEmpty(query)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      'A non-empty query parameter is required.',
    ).build();
  }

  const hasDataRead = session.user!.office.role.permissions.includes(permission.SAAOB_DATA_READ);
  const officeId = hasDataRead ? undefined : session.user!.office.id;
  const result = await saaob.searchItems(query, officeId);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
