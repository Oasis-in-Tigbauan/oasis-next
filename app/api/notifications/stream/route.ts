import * as Sentry from '@sentry/nextjs';
import {NextRequest} from 'next/server';
import {createClient} from 'redis';

import {session as auth, SessionCode} from '@/lib/auth';
import {getNotificationChannel} from '@/lib/realtime/notifications';

const REDIS_URL = process.env.REDIS_URL;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth.verify();
  if (!session || session.code !== SessionCode.Ok) {
    return new Response('Unauthorized', {status: 401});
  }

  const userId = session.user!.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const subscriber = REDIS_URL
        ? createClient({url: REDIS_URL}).on('error', (error) => Sentry.captureException(error))
        : null;

      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const close = async () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }

        if (subscriber?.isOpen) {
          try {
            await subscriber.unsubscribe(getNotificationChannel(userId));
            await subscriber.quit();
          } catch (error) {
            Sentry.captureException(error);
          }
        }

        try {
          controller.close();
        } catch {}
      };

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {}
      }, 15000);

      req.signal.addEventListener(
        'abort',
        () => {
          void close();
        },
        {once: true},
      );

      controller.enqueue(encoder.encode('event: ready\ndata: {"ok":true}\n\n'));

      if (!subscriber) {
        return;
      }

      try {
        await subscriber.connect();
        await subscriber.subscribe(getNotificationChannel(userId), (message) => {
          try {
            controller.enqueue(encoder.encode(`event: notification\ndata: ${message}\n\n`));
          } catch {}
        });
      } catch (error) {
        Sentry.captureException(error);
        await close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}
