import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type PayrollEntryItem = {
  id: string;
  serialNo: number;
  signatureNo: number;
  name: string;
  position: string;
  idNo?: string;
  amount: string;
};

export type PayrollItem = {
  id: string;
  date: string;
  payrollNo: string;
  payrollMonth: string;
  purpose: string;
  periodCovered: string;
  lgu: string;
  fund: string;
  sheetNumber: string;
  totalSheets: string;
  authorizedOfficial: string;
  headOfAccounting: string;
  headOfTreasury: string;
  localChiefExecutive: string;
  disbursingOfficer: string;
  cafaoNo?: string;
  cafaoDate?: string;
  totalAmount: string;
  entries: PayrollEntryItem[];
};

export type PayrollListResponse = GenericOkResponse<PayrollItem[]>;
export type PayrollResponse = GenericOkResponse<PayrollItem>;
