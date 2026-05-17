import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type PurchasingValidSignatory = {
  id: string;
  name: string;
  position: string;
};

export type PurchasingValidSignatoriesResponse = GenericOkResponse<{
  headOfOffice: PurchasingValidSignatory[];
  treasurer: PurchasingValidSignatory[];
  mayor: PurchasingValidSignatory[];
}>;
