import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type ObrMainDataAipReference = {
  id: string;
  aipCode: string;
  aipDescription: string;
  amount: string;
};

export type ObrMainDataItem = {
  id: string;
  obrNumber: string;
  alobs: string;
  date: string;
  payee: string;
  address: string;
  requestSourceId: string;
  responsibilityCenter: {
    id: string;
    name: string;
    sector: string | null;
    function: string | null;
  };
  expenseCode: {
    id: string;
    expenseName: string;
    accountCode: string | null;
    subClassification: string | null;
    expenseClass: string | null;
  };
  prNumber: string;
  particulars: string;
  obligated: string;
  prAmount: string;
  disbursed: string;
  varianceDisbursed: string;
  remarks: string | null;
  aipReferences: ObrMainDataAipReference[];
  varObrVsF4: string;
  quarter: string;
  publisher: {
    id: string;
    name: string;
  };
};

export type ObrMainDataListResponse = GenericOkResponse<ObrMainDataItem[]>;
