import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type ElecItem = {
  id: string;
  dv: {
    id: string;
    disbursementVoucherNumber: string;
  };
  billingName: string;
  meterSerial: string;
  account: string;
  gross: string;
  vatableSales: string;
  taxType: string;
  vat5: string;
  evat2: string;
  net: string;
};

export type ElecListResponse = GenericOkResponse<ElecItem[]>;
