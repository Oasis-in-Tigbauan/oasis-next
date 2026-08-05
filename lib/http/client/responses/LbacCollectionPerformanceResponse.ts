import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export interface CollPerfMonthlyData {
  id: string;
  month: number;
  year: number;
  quarter: number;
  value: string;
}

export interface CollPerfItemResponse {
  type: 6781;
  id: string;
  particulars: string;
  accountCode: string | null;
  incomeTarget: string;
  monthlyData: CollPerfMonthlyData[];
  quarterlyData: {
    q1: string;
    q2: string;
    q3: string;
    q4: string;
  };
  totalCollection: string;
  collectionPerformance: string;
  excessOrDeficit: string;
}

export interface CollPerfGroupTotals {
  incomeTarget: string;
  monthlyData: CollPerfMonthlyData[];
  quarterlyData: {
    q1: string;
    q2: string;
    q3: string;
    q4: string;
  };
  totalCollection: string;
  collectionPerformance: string;
  excessOrDeficit: string;
}

export interface CollPerfGroupResponse {
  type: 6780;
  id: string;
  name: string;
  children: Array<CollPerfGroupResponse | CollPerfItemResponse>;
  totals: CollPerfGroupTotals;
}

export type CollPerfResponse = GenericOkResponse<CollPerfGroupResponse[]>;
