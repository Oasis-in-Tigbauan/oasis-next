import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type LbacF4ItemResponse = {
  id: string;
  particulars: string;
  accountCode: string | null;
  estimate: string | null;
  actual: string | null;
  varianceAmounts: string;
  variancePercentage: string;
  remarks: string | null;
  forFiscalYear: number;
  parentId: string | null;
  children: LbacF4ItemResponse[];
};

export type LbacF4Response = GenericOkResponse<LbacF4ItemResponse[]>;
