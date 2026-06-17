import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type ObrDisbursementTaxBreakdown = {
  tax: string | null;
  vat5: string | null;
  pt3: string | null;
  ewt2: string | null;
  ewt1: string | null;
  netAmount: string | null;
};

export type ObrDisbursementVoucherItem = {
  id: string;
  disbursementVoucherNumber: string;
  createdAt: string;
  payee: string;
  address: string;
  particulars: string;
  explanation: string | null;
  isOneForAll: boolean;
  withCheque: boolean;
  disbursementBatchId: string;
  requestId: string | null;
  requestItemId: string | null;
  grossAmount: string | null;
  vatableAmount: string | null;
  taxType: string | null;
  taxBreakdown: ObrDisbursementTaxBreakdown;
  responsibilityCenter: {
    id: string;
    aa: string;
  };
  signers: {
    accountant: { id: string | null; name: string | null; position: string | null };
    treasurer: { id: string | null; name: string | null; position: string | null };
    mayor: { id: string | null; name: string | null; position: string | null };
    headOfOffice: { id: string | null; name: string | null; position: string | null };
  };
  fundType: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  status: string | null;
  prNumber: string | null;
  hasElecData: boolean;
};

export type ObrDisbursementVoucherListResponse = GenericOkResponse<ObrDisbursementVoucherItem[]>;
