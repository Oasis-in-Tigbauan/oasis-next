import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type LbacAipRef = {
  id: string;
  aipReferenceCode: string;
  description: string;
};

export type LbacImplementingUnit = {
  id: string;
  name: string;
};

export type LbacItemResponse = {
  id: string;
  /** LbacObjectType.Item = 6768 */
  type: 6768;
  createdAt: string;
  mfoPpa: string;
  majorFinalOutput: string | null;
  performanceOutputIndicator: string | null;
  targetForBudgetYear: string | null;
  proposedBudgetPS: string;
  proposedBudgetMOOE: string;
  proposedBudgetFE: string;
  proposedBudgetCO: string;
  proposedBudgetTotal: string;
  aipRefCode: LbacAipRef | null;
  implementingUnit: LbacImplementingUnit | null;
  appropriation: {
    contOrSupplementalAugmentation: string;
    current: string;
    total: string;
  };
  allotmentReleased: {
    previousQuarters: string;
    thisQuarter: string;
    total: string;
  };
  balanceOfAppropriation: string;
  obligations: {
    previousQuarters: string;
    thisQuarter: string;
    total: string;
  };
  unobligatedAmount: string;
  remarks: string | null;
  asCutOffMonth: {
    obligation: string;
    balance: string;
    percentage: string;
  };
  other: {
    aro: {
      number: string;
      id: string;
      type: string;
      office: {
        id: string;
        name: string;
        code: string;
      };
    } | null;
    budgetType: string | null;
    gadable: boolean;
    tagging: string | null;
    amountAttributed: string | null;
    expenseCode: {
      id: string;
      accountName: string;
      accountCode: string | null;
    } | null;
    saaob: {
      id: string;
      name: string;
      accountCode: string | null;
    } | null;
    priorYearAccomplishments: string | null;
    physicalTargets: string | null;
    remarks: string | null;
  };
  financialAllocation: {
    Q1: string;
    Q2: string;
    Q3: string;
    Q4: string;
    total: string;
  };
  actualFinancialPerformance: {
    Q1: string;
    Q2: string;
    Q3: string;
    Q4: string;
    total: string;
  };
  variance: string;
  quarterlyReport: {
    physicalTargets: {
      Q1: string | null;
      Q2: string | null;
      Q3: string | null;
      Q4: string | null;
      total: string | null;
    };
    actualPhysicalPerformance: {
      Q1: string | null;
      Q2: string | null;
      Q3: string | null;
      Q4: string | null;
      total: string | null;
    };
    variance: string | null;
    accomplishment: string | null;
    remarks: string | null;
  };
};

export type LbacGroupTotals = {
  proposedBudgetPS: string;
  proposedBudgetMOOE: string;
  proposedBudgetFE: string;
  proposedBudgetCO: string;
  proposedBudgetTotal: string;
  appropriation: {
    contOrSupplementalAugmentation: string;
    current: string;
    total: string;
  };
  allotmentReleased: {
    previousQuarters: string;
    thisQuarter: string;
    total: string;
  };
  balanceOfAppropriation: string;
  obligations: {
    previousQuarters: string;
    thisQuarter: string;
    total: string;
  };
  unobligatedAmount: string;
  asCutOffMonth: {
    obligation: string;
    balance: string;
    percentage: string;
  };
  other: {
    amountAttributed: string;
  };
  financialAllocation: {
    Q1: string;
    Q2: string;
    Q3: string;
    Q4: string;
    total: string;
  };
  actualFinancialPerformance: {
    Q1: string;
    Q2: string;
    Q3: string;
    Q4: string;
    total: string;
  };
  variance: string;
};

export type LbacGroupResponse = {
  id: string;
  /** LbacObjectType.Group = 6767 */
  type: 6767;
  name: string;
  aipRefCode: LbacAipRef | null;
  implementingUnit: LbacImplementingUnit | null;
  children: (LbacGroupResponse | LbacItemResponse)[];
  totals: LbacGroupTotals;
};

export type LbacDataResponse = GenericOkResponse<LbacGroupResponse[]>;
