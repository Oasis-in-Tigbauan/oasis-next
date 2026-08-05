import {session as auth, SessionCode} from '@/lib/auth';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';

export async function GET() {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  return ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody(session.user!).build();
}
