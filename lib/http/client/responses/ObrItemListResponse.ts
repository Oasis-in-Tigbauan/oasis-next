import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type ObrItemOfficeData = {
  id: string;
  amount: string;
  responsibilityCenter: {
    id: string;
    name: string;
  };
  expenseCode: {
    id: string;
    name: string;
    fpp: string | null;
    accountCode: string | null;
  };
};

export type ObrItem = {
  id: string;
  obrRefNumber: string;
  dvRefNumber: string;
  date: string;
  payee: string;
  address: string;
  particulars: string;
  amounts: ObrItemOfficeData[];
  overallAmount: string;
  requestingOfficial: {
    id: string;
    name: string;
    position: string;
  };
  publisher: {
    id: string;
    name: string;
    position: string;
  };
};

export type ObrItemListResponse = GenericOkResponse<ObrItem[]>;
