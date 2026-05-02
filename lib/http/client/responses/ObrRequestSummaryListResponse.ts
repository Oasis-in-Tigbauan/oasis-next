import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type ObrRequestSummaryItem = {
  id: string;
  type: string;
  requestNumber: string;
  payee: string;
  officeAddress: string;
  obrNumber: Optional<string>;
  prNumber: Optional<string>;
  requestItemsCount: number;
  approvalStatus: "pending" | "approved" | "binned" | "mixed";
};

export type ObrRequestSummaryListResponse = GenericOkResponse<Array<ObrRequestSummaryItem>>;
