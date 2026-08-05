import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type SaaobStatisticType = 'budget' | 'sum_per_sector';

export type SaaobStatisticAggregateResponse = {
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

export type SaaobStatisticItemResponse = SaaobStatisticAggregateResponse & {
  id: string;
  name: string;
  type: SaaobStatisticType;
  isGroup: false;
  parentId: string | null;
  selectedMainGroupIds: string[];
  selectedSummaryItemIds: string[];
};

export type SaaobStatisticGroupResponse = {
  id: string;
  name: string;
  type: SaaobStatisticType;
  isGroup: true;
  parentId: string | null;
  total: SaaobStatisticAggregateResponse;
  children: Array<SaaobStatisticGroupResponse | SaaobStatisticItemResponse>;
};

export type SaaobStatisticsDataResponse = GenericOkResponse<
  Array<SaaobStatisticGroupResponse | SaaobStatisticItemResponse>
>;

export function isSaaobStatisticDataGroup(
  node: SaaobStatisticGroupResponse | SaaobStatisticItemResponse,
): node is SaaobStatisticGroupResponse {
  return 'children' in node;
}
