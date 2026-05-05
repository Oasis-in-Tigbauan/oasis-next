import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type SupplementalItem = {
  id: string;
  supplementalOrAugmentation: string | null | undefined;
  charges: string | null | undefined;
  amount: string;
  supplementalType: "less" | "add";
  aipCode: string | null | undefined;
  date: string;
  quarter: string;
};

export type SupplementalListResponse = GenericOkResponse<SupplementalItem[]>;
