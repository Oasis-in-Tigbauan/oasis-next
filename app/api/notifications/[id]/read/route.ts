import {session as auth, SessionCode} from '@/lib/auth';
import {ApiResponseBuilder, StatusCodes} from '@/lib/http/composers';
import * as notifications from '@/lib/notifications';
import {oneOf} from '@/lib/one-of';

export async function PATCH(_: Request, {params}: RouteContext<'/api/notifications/[id]/read'>) {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return ApiResponseBuilder.createFromSessionValidation(session).build();
  }

  const {id} = await params;
  const result = await notifications.markNotificationAsRead(session.user!.id, id);
  return oneOf(result).match(
    () => ApiResponseBuilder.create(StatusCodes.Status200Ok).withBody({ok: true}).build(),
    (error) => ApiResponseBuilder.createFromFailure(error).build(),
  );
}
