import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type SaaobSummaryItemResponse = {
  id: string;
  name: string;
  linkedGroupIds: string[];
  annualBudget: string;
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
    obligationWithPRs: {
      value: string;
      balance: string;
      percentage: string;
    };
    pr: string;
  };
};

export type SaaobSummaryGroupResponse = {
  id: string;
  name: string;
  children: Array<SaaobSummaryGroupResponse | SaaobSummaryItemResponse>;
};

export type SaaobSummaryDataResponse = GenericOkResponse<SaaobSummaryGroupResponse[]>;

export function isSaaobSummaryDataGroup(
  node: SaaobSummaryGroupResponse | SaaobSummaryItemResponse,
): node is SaaobSummaryGroupResponse {
  return 'children' in node;
}
