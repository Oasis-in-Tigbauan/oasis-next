import type {DomainEvent} from '@/lib/events';
import * as notifications from '@/lib/notifications';
import type {Result} from '@/lib/one-of';

export async function handleObrNotificationsEvent(
  event: DomainEvent,
): Promise<Result<null> | void> {
  switch (event.type) {
    case 'obr.request.submitted':
      return notifications.notifyObrRequestSubmitted(event.payload);
    case 'obr.request.approval-moved':
      return notifications.notifyObrApprovalMovement(event.payload);
    case 'obr.request.disbursement-created':
      return notifications.notifyObrRequestDisbursementCreated(event.payload);
    case 'obr.request.items-created':
      return notifications.notifyObrItemsCreated(event.payload);
    case 'obr.request.main-data-created':
      return notifications.notifyObrMainDataCreated(event.payload);
    default:
      return undefined;
  }
}
