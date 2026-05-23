import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type SaaobGroupTotalResponse = {
  annualBudget: string;
  supplementalOrContinuing: string;
  appropriation: string;
  allotment: string;
  obligation: string;
  unObligatedBalance: string;
  percentage: string;
  other: {
    quarterlyAllotmentBalance: { value: string; percentage: string };
    disbursed: { value: string; percentage: string; variance: string };
    lbacBudget: { value: string; variance: string; obligated: string; varianceObligated: string };
    obligationWithPRs: { value: string; balance: string; percentage: string };
    pr: string;
  };
};

export type SaaobEntryResponse = {
  id: string;
  name: string;
  accountCode?: string | null;
  annualBudget: string;
  allotmentShouldCopyFromAppropriation: boolean;
  supplementalOrContinuing: string;
  appropriation: string;
  allotment: string;
  obligation: string;
  unObligatedBalance: string;
  percentage: string;
  other: {
    quarterlyAllotmentBalance: {
      value: string;
      percentage: string;
    };
    disbursed: {
      value: string;
      percentage: string;
      variance: string;
    };
    lbacBudget: {
      value: string;
      variance: string;
      obligated: string;
      varianceObligated: string;
    };
    remarks?: string;
    obligationWithPRs: {
      value: string;
      balance: string;
      percentage: string;
    };
    pr: string;
  };
};

export type SaaobGroupResponse = {
  id: string;
  name: string;
  officeId?: string | null;
  total: SaaobGroupTotalResponse;
  children: Array<SaaobGroupResponse | SaaobEntryResponse>;
};

export type SaaobDataResponse = GenericOkResponse<SaaobGroupResponse[]>;
export type SaaobOfficeResponse = GenericOkResponse<SaaobGroupResponse[]>;

export function isSaaobDataGroup(
  node: SaaobGroupResponse | SaaobEntryResponse,
): node is SaaobGroupResponse {
  return "children" in node;
}
