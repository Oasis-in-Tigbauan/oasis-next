import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import {oneOf} from '@/lib/one-of';
import * as saaob from '@/lib/saaob';

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.SAAOB_DATA_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const rawYear = req.nextUrl.searchParams.get('year');
  const rawMonth = req.nextUrl.searchParams.get('month');

  if ((rawYear === null) !== (rawMonth === null)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      "Both 'year' and 'month' must be provided together.",
    ).build();
  }

  let year: number | undefined;
  let month: number | undefined;

  if (rawYear !== null && rawMonth !== null) {
    year = parseInt(rawYear, 10);
    month = parseInt(rawMonth, 10);

    if (!Number.isFinite(year) || year < 2000) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status400BadRequest,
        "Invalid 'year': must be an integer of 2000 or later.",
      ).build();
    }

    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status400BadRequest,
        "Invalid 'month': must be an integer between 1 and 12.",
      ).build();
    }
  }

  const result = await saaob.getAll(year, month);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
