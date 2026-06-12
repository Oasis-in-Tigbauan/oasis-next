"use client";

import { Bell } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  NotificationListResponse,
} from "@/lib/http/client/responses";

import NotificationList from "@/components/notification-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function NotificationBell() {
  const { data, mutate } = useSWR<BetterFetchResponse<NotificationListResponse, ApiResponseException>>(
    "/api/notifications?limit=8",
    $fetch,
  );

  const notifications = data?.data?.data;
  const unreadCount = notifications?.unreadCount ?? 0;
  const items = notifications?.items ?? [];

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    await mutate();
  };

  const markAllRead = async () => {
    const response = await fetch("/api/notifications/read-all", { method: "PATCH" });
    if (response.ok) {
      await mutate();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-9 rounded-full border border-[#D8E2EC] bg-white text-[#52657A] hover:bg-[#F7FAFC] hover:text-[#022551]"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[26rem] p-0">
        <div className="border-b border-[#E3EAF2] px-4 py-3">
          <p className="text-sm font-semibold text-[#122033]">Notifications</p>
          <p className="text-xs text-[#52657A]">Recent request movement and approvals.</p>
        </div>
        <ScrollArea className="max-h-[28rem] px-4 py-3">
          <NotificationList
            emptyMessage="No notifications yet."
            items={items}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
          />
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
