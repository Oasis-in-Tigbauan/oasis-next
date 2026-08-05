import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import * as lbac from '@/lib/lbac';
import {Failure} from '@/lib/one-of';
import {validatorUtilities} from '@/lib/validators';

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.LBAC_DATA_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {searchParams} = req.nextUrl;
  const rawYear = searchParams.get('year');
  const rawQuarter = searchParams.get('quarter');
  const aroLink = searchParams.get('aroLink');

  if (!rawYear || !rawQuarter || !aroLink) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      "Query parameters 'year', 'quarter', and 'aroLink' are required.",
    ).build();
  }

  const year = Number.parseInt(rawYear, 10);
  const quarter = Number.parseInt(rawQuarter, 10);

  if (!Number.isFinite(year) || year < 2000) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      "Invalid 'year'.",
    ).build();
  }
  if (!Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      "Invalid 'quarter': must be 1-4.",
    ).build();
  }
  if (!validatorUtilities.isUuid(aroLink)) {
    return ApiResponseBuilder.createError(
      StatusCodes.Status400BadRequest,
      "Invalid 'aroLink'.",
    ).build();
  }

  const result = await lbac.exportForm3ToBuffer({year, quarter, aroLink});
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const filename = `lbac-form-3-${year}-Q${quarter}.xlsx`;
  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=\"${filename}\"`,
    },
  });
}
