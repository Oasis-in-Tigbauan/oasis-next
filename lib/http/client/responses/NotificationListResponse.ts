import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type NotificationItemResponse = {
  id: string;
  scope: string;
  entityId: string | null;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationListPayload = {
  unreadCount: number;
  items: NotificationItemResponse[];
};

export type NotificationListResponse = GenericOkResponse<NotificationListPayload>;
