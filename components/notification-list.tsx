'use client';

import Link from 'next/link';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import type {NotificationItemResponse} from '@/lib/http/client/responses';
import {cn} from '@/lib/utils';

type NotificationListProps = {
  emptyMessage: string;
  items: NotificationItemResponse[];
  onMarkAllRead?: () => void;
  onMarkRead?: (id: string) => void;
};

export default function NotificationList({
  emptyMessage,
  items,
  onMarkAllRead,
  onMarkRead,
}: NotificationListProps) {
  return (
    <div className="flex flex-col gap-3">
      {onMarkAllRead && items.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onMarkAllRead}
          >
            Mark all as read
          </Button>
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-[#D8E2EC] bg-[#F8FAFD] px-4 py-6 text-center text-sm text-[#52657A]">
          {emptyMessage}
        </div>
      )}

      {items.map((item) => {
        const content = (
          <div
            className={cn(
              'rounded-xl border px-4 py-3 transition-colors',
              item.read ? 'border-[#E3EAF2] bg-white' : 'border-[#C9D7E6] bg-[#F6FAFF]',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[#122033]">{item.title}</p>
                  {!item.read && (
                    <Badge variant="secondary" className="h-5 text-[10px]">
                      New
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-[#52657A]">{item.message}</p>
                <p className="text-xs text-[#7B8CA0]">{formatNotificationDate(item.createdAt)}</p>
              </div>
              {!item.read && onMarkRead && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onMarkRead(item.id);
                  }}
                >
                  Read
                </Button>
              )}
            </div>
          </div>
        );

        if (!item.href) {
          return <div key={item.id}>{content}</div>;
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={() => {
              if (!item.read) onMarkRead?.(item.id);
            }}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

function formatNotificationDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-PH', {
    timeZone: 'Asia/Taipei',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
