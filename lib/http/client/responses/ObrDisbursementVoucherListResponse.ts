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
  grossAmount: string | null;
  vatableAmount: string | null;
  taxType: string | null;
  taxBreakdown: ObrDisbursementTaxBreakdown;
  responsibilityCenter: {
    id: string;
    aa: string;
  };
  signers: {
    accountant: { id: string; name: string; position: string };
    treasurer: { id: string; name: string; position: string };
    mayor: { id: string; name: string; position: string };
    headOfOffice: { id: string; name: string; position: string };
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
