import { createClient } from "redis";
import * as Sentry from "@sentry/nextjs";

const REDIS_URL = process.env.REDIS_URL;

export type NotificationRealtimeEvent = {
  type: "notifications.updated";
  at: string;
};

export function getNotificationChannel(userId: string) {
  return `notifications:user:${userId}`;
}

export async function publishNotificationUpdate(userId: string): Promise<void> {
  if (!REDIS_URL) return;

  const client = createClient({ url: REDIS_URL })
    .on("error", (error) => Sentry.captureException(error));

  try {
    await client.connect();
    await client.publish(
      getNotificationChannel(userId),
      JSON.stringify({
        type: "notifications.updated",
        at: new Date().toISOString(),
      } satisfies NotificationRealtimeEvent),
    );
  } catch (error) {
    Sentry.captureException(error);
  } finally {
    if (client.isOpen) {
      await client.quit();
    }
  }
}
