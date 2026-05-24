"use client";

import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  NotificationListResponse,
} from "@/lib/http/client/responses";

import NotificationList from "@/components/notification-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardNotifications() {
  const { data, error, mutate } = useSWR<BetterFetchResponse<NotificationListResponse, ApiResponseException>>(
    "/api/notifications?limit=10",
    $fetch,
  );

  const notifications = data?.data;
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
    <Card className="border-[#D8E2EC] bg-white/92">
      <CardHeader>
        <CardTitle className="text-[#122033]">Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">Unable to load notifications.</p>
        ) : (
          <NotificationList
            emptyMessage="No request movement yet."
            items={items}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
          />
        )}
      </CardContent>
    </Card>
  );
}
