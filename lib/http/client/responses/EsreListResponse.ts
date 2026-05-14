import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type EsreItem = {
  id: string;
  date: string;
  payee: string;
  natureOfPayment: string;
  amount: string;
  checkStatus: string | null | undefined;
  checkNumber: string | null | undefined;
  dvOrPayrollNumber: string | null | undefined;
  remarks: string | null | undefined;
  fundingSource: {
    id: string;
    name: string;
  };
  expenseType: {
    id: string;
    name: string;
  } | null | undefined;
  saaob: {
    id: string;
    name: string;
  } | null | undefined;
  obr: {
    id: string;
    requestNumber: string;
    expenseClass: {
      id: string;
      accountName: string;
      accountCode: string | null | undefined;
      subClassification: string | null | undefined;
    };
    office: {
      id: string;
      name: string;
    };
  } | null | undefined;
  disbursed: string;
};

export type EsreListResponse = GenericOkResponse<EsreItem[]>;
