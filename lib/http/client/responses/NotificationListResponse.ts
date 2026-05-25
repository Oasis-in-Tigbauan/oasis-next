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

export type NotificationListResponse = {
  unreadCount: number;
  items: NotificationItemResponse[];
};
