import {NextResponse} from 'next/server';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permission from '@/lib/db/permissions';
import {ApiResponseBuilder} from '@/lib/http/composers';
import * as lbac from '@/lib/lbac';
import {Failure} from '@/lib/one-of';

function _getFiscalYearUtc8(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
}

export async function GET() {
  const session = await auth.verify([permission.LBAC_DATA_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const result = await lbac.exportForm6ToBuffer();
  if (result instanceof Failure) {
    return ApiResponseBuilder.createFromFailure(result).build();
  }

  const fiscalYear = _getFiscalYearUtc8();
  const filename = `lbac-form-6-fy-${fiscalYear}.xlsx`;

  return new NextResponse(new Uint8Array(result.value), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=\"${filename}\"`,
    },
  });
}
