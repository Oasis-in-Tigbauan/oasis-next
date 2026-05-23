import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";
import type { LbacAipRef, LbacImplementingUnit } from "@/lib/http/client/responses/LbacDataResponse";

export type LbacQuarterlyItemResponse = {
  id: string;
  /** LbacObjectType.Item = 6768 */
  type: 6768;
  mfoPpa: string;
  aipRefCode: LbacAipRef | null;
  implementingUnit: LbacImplementingUnit | null;
  appropriation: {
    contOrSupplementalAugmentation: string;
    current: string;
    total: string;
  };
  asCutOffMonth: {
    obligation: string;
    balance: string;
  };
  priorYearAccomplishments: string | null;
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
  targetForBudgetYear: string | null;
};

export type LbacQuarterlyGroupTotals = {
  appropriation: {
    contOrSupplementalAugmentation: string;
    current: string;
    total: string;
  };
  asCutOffMonth: {
    obligation: string;
    balance: string;
  };
};

export type LbacQuarterlyGroupResponse = {
  id: string;
  /** LbacObjectType.Group = 6767 */
  type: 6767;
  name: string;
  aipRefCode: LbacAipRef | null;
  implementingUnit: LbacImplementingUnit | null;
  children: (LbacQuarterlyGroupResponse | LbacQuarterlyItemResponse)[];
  totals: LbacQuarterlyGroupTotals;
};

export type LbacOfficeQuarterlyResponse = GenericOkResponse<LbacQuarterlyGroupResponse[]>;
