import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";
import type { LbacAipRef, LbacImplementingUnit } from "@/lib/http/client/responses/LbacDataResponse";

export type LbacViewerItemResponse = {
  id: string;
  /** LbacObjectType.Item = 6768 */
  type: 6768;
  aipRefCode: LbacAipRef | null;
  mfoPpa: string;
  implementingUnit: LbacImplementingUnit | null;
  proposedBudgetTotal: string;
  asCutOffMonth: {
    obligation: string;
    balance: string;
    percentage: string;
  };
  other: {
    expenseCode: {
      id: string;
      accountName: string;
      accountCode: string | null;
    } | null;
  };
};

export type LbacViewerGroupTotals = {
  proposedBudgetTotal: string;
  asCutOffMonth: {
    obligation: string;
    balance: string;
    percentage: string;
  };
};

export type LbacViewerGroupResponse = {
  id: string;
  /** LbacObjectType.Group = 6767 */
  type: 6767;
  name: string;
  aipRefCode: LbacAipRef | null;
  implementingUnit: LbacImplementingUnit | null;
  children: (LbacViewerGroupResponse | LbacViewerItemResponse)[];
  totals: LbacViewerGroupTotals;
};

export type LbacViewerResponse = GenericOkResponse<LbacViewerGroupResponse[]>;
