import type {NextRequest} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import * as lbac from '@/lib/lbac';
import {oneOf} from '@/lib/one-of';

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.LBAC_QUARTERLY_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const yearParam = req.nextUrl.searchParams.get('year');
  const quarterParam = req.nextUrl.searchParams.get('quarter');

  let year: number | undefined;
  let quarter: number | undefined;

  if (yearParam !== null || quarterParam !== null) {
    if (yearParam === null || quarterParam === null) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status400BadRequest,
        "Both 'year' and 'quarter' must be provided together.",
      ).build();
    }

    const parsedYear = parseInt(yearParam, 10);
    const parsedQuarter = parseInt(quarterParam, 10);

    if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status400BadRequest,
        "Invalid 'year'. Must be an integer between 2000 and 2100.",
      ).build();
    }

    if (!Number.isInteger(parsedQuarter) || parsedQuarter < 1 || parsedQuarter > 4) {
      return ApiResponseBuilder.createError(
        StatusCodes.Status400BadRequest,
        "Invalid 'quarter'. Must be an integer between 1 and 4.",
      ).build();
    }

    year = parsedYear;
    quarter = parsedQuarter;
  }

  const restrictToOfficeId = lbac.resolveLbacOfficeRestriction(
    session.user!.office.role.permissions,
    session.user!.office.id,
  );

  const result = await lbac.getAllQuarterlyReports(year, quarter, restrictToOfficeId);
  return oneOf(result).match(
    (s) => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(s).build(),
    (e) => ApiResponseBuilder.createFromFailure(e).build(),
  );
}
