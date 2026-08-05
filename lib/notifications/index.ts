import {and, desc, eq, inArray, isNull} from 'drizzle-orm';
import {DateTime} from 'luxon';

import {db} from '@/lib/db';
import * as permissions from '@/lib/db/permissions';
import {appNotifications, officePosition, user} from '@/lib/db/schema';
import {ErrorCodes, Failure, type Result, Success} from '@/lib/one-of';
import {publishNotificationUpdate} from '@/lib/realtime/notifications';

export type AppNotification = {
  id: string;
  scope: string;
  entityId: string | null;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

type NotificationInsert = {
  userId: string;
  scope: string;
  entityId?: string | null;
  title: string;
  message: string;
  href?: string | null;
};

type ObrRequestMovementArgs = {
  requestId: string;
  requestNumber: string;
  officeId: string;
  actorName: string;
};

export async function listNotificationsForUser(
  userId: string,
  limit = 12,
): Promise<
  Result<{
    unreadCount: number;
    items: AppNotification[];
  }>
> {
  try {
    const [rows, unreadRows] = await Promise.all([
      db
        .select({
          id: appNotifications.id,
          scope: appNotifications.scope,
          entityId: appNotifications.entityId,
          title: appNotifications.title,
          message: appNotifications.message,
          href: appNotifications.href,
          readAt: appNotifications.readAt,
          createdAt: appNotifications.createdAt,
        })
        .from(appNotifications)
        .where(eq(appNotifications.userId, userId))
        .orderBy(desc(appNotifications.createdAt))
        .limit(limit),
      db
        .select({id: appNotifications.id})
        .from(appNotifications)
        .where(and(eq(appNotifications.userId, userId), isNull(appNotifications.readAt))),
    ]);

    return new Success({
      unreadCount: unreadRows.length,
      items: rows.map((row) => ({
        id: row.id,
        scope: row.scope,
        entityId: row.entityId,
        title: row.title,
        message: row.message,
        href: row.href,
        read: row.readAt !== null,
        createdAt: DateTime.fromJSDate(row.createdAt, {zone: 'utc'}).setZone('UTC+8').toISO()!,
      })),
    });
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to list notifications.', {userId, limit}, e);
  }
}

export async function markNotificationAsRead(
  userId: string,
  notificationId: string,
): Promise<Result<null>> {
  try {
    await db
      .update(appNotifications)
      .set({readAt: new Date()})
      .where(
        and(
          eq(appNotifications.id, notificationId),
          eq(appNotifications.userId, userId),
          isNull(appNotifications.readAt),
        ),
      );

    await publishNotificationUpdate(userId);

    return new Success(null);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to mark notification as read.',
      {userId, notificationId},
      e,
    );
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<Result<null>> {
  try {
    await db
      .update(appNotifications)
      .set({readAt: new Date()})
      .where(and(eq(appNotifications.userId, userId), isNull(appNotifications.readAt)));

    await publishNotificationUpdate(userId);

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Unable to mark all notifications as read.', {userId}, e);
  }
}

export async function notifyObrRequestSubmitted(
  args: ObrRequestMovementArgs & {approverPositionIds: string[]},
): Promise<Result<null>> {
  const officeRecipientsResult = await getObrOfficeRecipients(args.officeId);
  if (officeRecipientsResult instanceof Failure) return officeRecipientsResult;

  const approverRecipientsResult = await getUsersByPositionIds(args.approverPositionIds);
  if (approverRecipientsResult instanceof Failure) return approverRecipientsResult;

  const officeRecipients = officeRecipientsResult.value;
  const approverRecipients = approverRecipientsResult.value;

  return createNotifications([
    ...approverRecipients.map((userId) => ({
      userId,
      scope: 'obr.request',
      entityId: args.requestId,
      title: 'New OBR request awaiting review',
      message: `${args.actorName} submitted request ${args.requestNumber}.`,
      href: '/dashboard/obr/approvals',
    })),
    ...officeRecipients.map((userId) => ({
      userId,
      scope: 'obr.request',
      entityId: args.requestId,
      title: 'OBR request submitted',
      message: `Request ${args.requestNumber} was submitted for approval.`,
      href: '/dashboard/obr/requests',
    })),
  ]);
}

export async function notifyObrApprovalMovement(
  args: ObrRequestMovementArgs & {
    status: 'pending' | 'approved' | 'binned';
    overallStatus: 'pending' | 'approved' | 'binned' | 'mixed';
    nextApproverPositionIds: string[];
  },
): Promise<Result<null>> {
  const officeRecipientsResult = await getObrOfficeRecipients(args.officeId);
  if (officeRecipientsResult instanceof Failure) return officeRecipientsResult;

  const nextApproverRecipientsResult =
    args.status === 'approved'
      ? await getUsersByPositionIds(args.nextApproverPositionIds)
      : new Success<string[]>([]);
  if (nextApproverRecipientsResult instanceof Failure) return nextApproverRecipientsResult;

  const statusLabel = args.status === 'binned' ? 'binned' : args.status;
  const finalLine =
    args.overallStatus === 'approved'
      ? 'The request is now fully approved.'
      : args.overallStatus === 'binned' || args.overallStatus === 'mixed'
        ? 'The request requires your attention.'
        : 'The request is still moving through approval.';

  const officeNotifications: NotificationInsert[] = officeRecipientsResult.value.map((userId) => ({
    userId,
    scope: 'obr.request',
    entityId: args.requestId,
    title: `OBR request ${statusLabel}`,
    message: `${args.actorName} updated request ${args.requestNumber}. ${finalLine}`,
    href: '/dashboard/obr/requests',
  }));

  const nextApproverNotifications: NotificationInsert[] = nextApproverRecipientsResult.value.map(
    (userId) => ({
      userId,
      scope: 'obr.request',
      entityId: args.requestId,
      title: 'OBR request awaiting your review',
      message: `${args.actorName} approved request ${args.requestNumber}. It is now pending your approval.`,
      href: '/dashboard/obr/approvals',
    }),
  );

  return createNotifications([...officeNotifications, ...nextApproverNotifications]);
}

export async function notifyObrRequestDisbursementCreated(
  args: ObrRequestMovementArgs,
): Promise<Result<null>> {
  return notifyOfficeMovement(args, {
    title: 'Disbursement created',
    message: `Disbursement processing has started for request ${args.requestNumber}.`,
  });
}

export async function notifyObrItemsCreated(args: ObrRequestMovementArgs): Promise<Result<null>> {
  return notifyOfficeMovement(args, {
    title: 'OBR items created',
    message: `OBR items were created from request ${args.requestNumber}.`,
  });
}

export async function notifyObrMainDataCreated(
  args: ObrRequestMovementArgs,
): Promise<Result<null>> {
  return notifyOfficeMovement(args, {
    title: 'OBR data created',
    message: `OBR data was created for request ${args.requestNumber}.`,
  });
}

async function notifyOfficeMovement(
  args: ObrRequestMovementArgs,
  payload: {title: string; message: string},
): Promise<Result<null>> {
  const officeRecipientsResult = await getObrOfficeRecipients(args.officeId);
  if (officeRecipientsResult instanceof Failure) return officeRecipientsResult;

  return createNotifications(
    officeRecipientsResult.value.map((userId) => ({
      userId,
      scope: 'obr.request',
      entityId: args.requestId,
      title: payload.title,
      message: payload.message,
      href: '/dashboard/obr/requests',
    })),
  );
}

async function createNotifications(notifications: NotificationInsert[]): Promise<Result<null>> {
  try {
    const deduped = new Map<string, NotificationInsert>();
    for (const notification of notifications) {
      const key = [
        notification.userId,
        notification.scope,
        notification.entityId ?? '',
        notification.title,
        notification.message,
        notification.href ?? '',
      ].join('|');
      deduped.set(key, notification);
    }

    if (deduped.size === 0) {
      return new Success(null);
    }

    const payload = [...deduped.values()];
    await db.insert(appNotifications).values(payload);
    await Promise.all(
      [...new Set(payload.map((notification) => notification.userId))].map((userId) =>
        publishNotificationUpdate(userId),
      ),
    );
    return new Success(null);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to create notifications.',
      {count: notifications.length},
      e,
    );
  }
}

async function getUsersByPositionIds(positionIds: string[]): Promise<Result<string[]>> {
  try {
    if (positionIds.length === 0) return new Success([]);

    const rows = await db
      .select({id: user.id})
      .from(user)
      .where(
        and(
          inArray(user.officePositionId, [...new Set(positionIds)]),
          eq(user.emailVerified, true),
          eq(user.banned, false),
          eq(user.shadowBanned, false),
        ),
      );

    return new Success(rows.map((row) => row.id));
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to resolve notification recipients by position.',
      {positionIds},
      e,
    );
  }
}

async function getObrOfficeRecipients(officeId: string): Promise<Result<string[]>> {
  try {
    const rows = await db
      .select({
        id: user.id,
        permissions: officePosition.permissions,
      })
      .from(user)
      .leftJoin(officePosition, eq(officePosition.id, user.officePositionId))
      .where(
        and(
          eq(user.officeId, officeId),
          eq(user.emailVerified, true),
          eq(user.banned, false),
          eq(user.shadowBanned, false),
        ),
      );

    const ids = rows
      .filter((row) => {
        const permissionSet = new Set(row.permissions ?? []);
        return (
          permissionSet.has(permissions.OBR_REQUEST_READ) ||
          permissionSet.has(permissions.OBR_REQUEST_CREATE)
        );
      })
      .map((row) => row.id);

    return new Success(ids);
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to resolve office notification recipients.',
      {officeId},
      e,
    );
  }
}
