import type { Result } from "@/lib/one-of";

import { handleObrNotificationsEvent } from "@/lib/events/subscribers/obr-notifications";

type ObrRequestMovementPayload = {
  requestId: string;
  requestNumber: string;
  officeId: string;
  actorName: string;
};

export type DomainEvent =
  | {
    type: "obr.request.submitted";
    payload: ObrRequestMovementPayload & { approverPositionIds: string[] };
  }
  | {
    type: "obr.request.approval-moved";
    payload: ObrRequestMovementPayload & {
      status: "pending" | "approved" | "binned";
      overallStatus: "pending" | "approved" | "binned" | "mixed";
      nextApproverPositionIds: string[];
    };
  }
  | {
    type: "obr.request.disbursement-created";
    payload: ObrRequestMovementPayload;
  }
  | {
    type: "obr.request.items-created";
    payload: ObrRequestMovementPayload;
  }
  | {
    type: "obr.request.main-data-created";
    payload: ObrRequestMovementPayload;
  };

type DomainEventHandler = (event: DomainEvent) => Promise<Result<null> | void>;

const domainEventHandlers: DomainEventHandler[] = [
  handleObrNotificationsEvent,
];

export async function publishEvent(event: DomainEvent): Promise<void> {
  await Promise.allSettled(
    domainEventHandlers.map((handler) => handler(event)),
  );
}
