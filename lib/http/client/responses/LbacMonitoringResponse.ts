import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';
import type {LbacAipRef, LbacImplementingUnit} from '@/lib/http/client/responses/LbacDataResponse';

export interface LbacMonitoringItemResponse {
  id: string;
  /** LbacObjectType.Item = 6768 */
  type: 6768;
  item: {
    id: string;
    mfoPpa: string;
    aipRefCode: {
      id: string;
      code: string;
      description: string;
      amount: string;
    } | null;
    implementingUnit: {
      id: string;
      name: string;
    } | null;
  };
  ab?: string;
  actualAccomplishment?: string;
  abEstimatedCost?: string;
  actualExpenditure?: string;
  remarks?: string;
  aipVsAb: string;
  aipVsExp: string;
}

export interface LbacMonitoringGroupResponse {
  id: string;
  /** LbacObjectType.Group = 6767 */
  type: 6767;
  name: string;
  aipRefCode: LbacAipRef | null;
  implementingUnit: LbacImplementingUnit | null;
  children: Array<LbacMonitoringGroupResponse | LbacMonitoringItemResponse>;
}

export type LbacMonitoringResponse = GenericOkResponse<LbacMonitoringGroupResponse[]>;
