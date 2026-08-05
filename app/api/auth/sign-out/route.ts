import {headers} from 'next/headers';

import {auth} from '@/lib/auth';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';

export async function POST() {
  await auth.api.signOut({
    headers: await headers(),
  });

  return ApiResponseBuilder.create(StatusCodes.Status204NoContent).build();
}
