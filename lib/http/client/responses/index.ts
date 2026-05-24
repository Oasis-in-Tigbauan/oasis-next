import type { AccountsListResponse } from "@/lib/http/client/responses/AccountsListResponse";
import type { ApiResponseException } from "@/lib/http/client/responses/ApiResponseException";
import type { EsreListResponse, EsreItem as EsreItemResponse } from "@/lib/http/client/responses/EsreListResponse";
import type { ExpenseClassByOfficeCodeListResponse } from "@/lib/http/client/responses/ExpenseClassByOfficeCodeListResponse";
import type { ExpenseClassResponse } from "@/lib/http/client/responses/ExpenseClassResponse";
import type { ExpenseClassListResponse } from "@/lib/http/client/responses/ExpenseClassListResponse";
import type { ExpenseTypeListResponse } from "@/lib/http/client/responses/ExpenseTypeListResponse";
import type { ExpenseTypeResponse } from "@/lib/http/client/responses/ExpenseTypeResponse";
import type { UserResponse } from "@/lib/http/client/responses/UserResponse";
import type { EnrollmentEligibilityResponse } from "@/lib/http/client/responses/EnrollmentEligibilityResponse";
import type { FundTypesListResponse } from "@/lib/http/client/responses/FundTypeListResponse";
import type { FundTypeResponse } from "@/lib/http/client/responses/FundTypeResponse";
import type { InvitationResponse } from "@/lib/http/client/responses/InvitationResponse";
import type { InvitationListResponse } from "@/lib/http/client/responses/InvitationListResponse";
import type { OfficeCodeListResponse } from "@/lib/http/client/responses/OfficeCodeListResponse";
import type { OfficeCodeResponse } from "@/lib/http/client/responses/OfficeCodeResponse";
import type { OfficeCodeWithHeadsResponse } from "@/lib/http/client/responses/OfficeCodeWithHeadsResponse";
import type { OfficeResponse } from "@/lib/http/client/responses/OfficeResponse";
import type { OfficeSingleResponse} from "@/lib/http/client/responses/OfficeSingleResponse";
import type {
  OfficeSingleResponseWithRoleExtendedInfo,
} from "@/lib/http/client/responses/OfficeSingleResponseWithRoleExtendedInfo";
import type { OfficesExtendedListResponse } from "@/lib/http/client/responses/OfficesExtendedListResponse";
import type { OfficesListResponse } from "@/lib/http/client/responses/OfficesListResponse";
import type { PermissionDefinitionResponse } from "@/lib/http/client/responses/PermissionDefinitionResponse";
import type { RoleDefinitionResponse } from "@/lib/http/client/responses/RoleDefinitionResponse";
import type { UnactivatedListResponse } from "@/lib/http/client/responses/UnactivatedListResponse";
import type { ObrRequestSummaryListResponse, ObrRequestSummaryItem } from "@/lib/http/client/responses/ObrRequestSummaryListResponse";
import type { ObrRequestDetailResponse, ObrRequestDetail, ObrRequestDetailItem, ObrRequestDetailApprover } from "@/lib/http/client/responses/ObrRequestDetailResponse";
import type { ObrDisbursementVoucherListResponse, ObrDisbursementVoucherItem, ObrDisbursementTaxBreakdown } from "@/lib/http/client/responses/ObrDisbursementVoucherListResponse";
import type { ObrItemListResponse, ObrItem, ObrItemOfficeData } from "@/lib/http/client/responses/ObrItemListResponse";
import type { ObrSearchResponse, ObrSearchItem } from "@/lib/http/client/responses/ObrSearchResponse";
import type {
  SupplementalListResponse,
  SupplementalItem as SupplementalItemResponse,
} from "@/lib/http/client/responses/SupplementalListResponse";
import type {
  AipListResponse,
  AipNodeResponse,
  AipReferenceResponse,
  AipReferenceSingleResponse,
} from "@/lib/http/client/responses/AipListResponse";
import type { AipSearchResponse, AipSearchResultItem } from "@/lib/http/client/responses/AipSearchResponse";
import type { ObrMainDataListResponse, ObrMainDataItem as ObrMainDataItemResponse, ObrMainDataAipReference } from "@/lib/http/client/responses/ObrMainDataListResponse";
import type { LbacDataResponse, LbacGroupResponse, LbacGroupTotals, LbacItemResponse, LbacAipRef, LbacImplementingUnit } from "@/lib/http/client/responses/LbacDataResponse";
import type {
  PpmpDataResponse,
  PpmpMajorGroupResponse,
  PpmpMinorGroupResponse,
  PpmpProjectGroupResponse,
  PpmpPlanItemResponse,
} from "@/lib/http/client/responses/PpmpDataResponse";
import type { LbacOfficeQuarterlyResponse, LbacQuarterlyGroupResponse, LbacQuarterlyGroupTotals, LbacQuarterlyItemResponse } from "@/lib/http/client/responses/LbacOfficeQuarterlyResponse";
import type { LbacViewerResponse, LbacViewerGroupResponse, LbacViewerGroupTotals, LbacViewerItemResponse } from "@/lib/http/client/responses/LbacViewerResponse";
import type { LbacSearchResponse, LbacSearchGroupItem, LbacSearchResultItem } from "@/lib/http/client/responses/LbacSearchResponse";
import type {
  LbacTemplateInfo,
  LbacTemplatesPayload,
  LbacTemplatesResponse,
} from "@/lib/http/client/responses/LbacTemplatesResponse";
import type { SaaobSearchResponse, SaaobSearchGroup, SaaobSearchEntry } from "@/lib/http/client/responses/SaaobSearchResponse";
import type {
  SaaobDataResponse,
  SaaobEntryResponse,
  SaaobGroupResponse,
  SaaobGroupTotalResponse,
  SaaobOfficeResponse,
} from "@/lib/http/client/responses/SaaobDataResponse";
import type {
  SaaobSummaryDataResponse,
  SaaobSummaryGroupResponse,
  SaaobSummaryItemResponse,
} from "@/lib/http/client/responses/SaaobSummaryDataResponse";
import type {
  SaaobTemplateInfo,
  SaaobTemplatesPayload,
  SaaobTemplatesResponse,
} from "@/lib/http/client/responses/SaaobTemplatesResponse";
import type { ProcurementTypesListResponse  } from "@/lib/http/client/responses/ProcurementTypesListResponse";
import type { ProcurementTypeResponse } from "@/lib/http/client/responses/ProcurementTypeResponse";
import type {
  PurchasingItemAip,
  PurchasingItemResponse,
  PurchasingItemSignatory,
  PurchasingListResponse,
} from "@/lib/http/client/responses/PurchasingListResponse";
import type {
  PurchasingValidSignatoriesResponse,
  PurchasingValidSignatory,
} from "@/lib/http/client/responses/PurchasingValidSignatoriesResponse";
import type { ElecListResponse, ElecItem as ElecItemResponse } from "@/lib/http/client/responses/ElecListResponse";
import type { NotificationItemResponse, NotificationListResponse } from "@/lib/http/client/responses/NotificationListResponse";
import type {
  TravelOrderListResponse,
  TravelOrderItem as TravelOrderItemResponse,
  TravelOrderRequestor as TravelOrderRequestorResponse,
  TravelOrderApprovedBy as TravelOrderApprovedByResponse,
  TravelOrderUserListResponse,
  TravelOrderUserItem as TravelOrderUserItemResponse,
} from "@/lib/http/client/responses/TravelOrderListResponse";

export { isSaaobGroup } from "@/lib/http/client/responses/SaaobSearchResponse";
export { isSaaobDataGroup } from "@/lib/http/client/responses/SaaobDataResponse";
export { isSaaobSummaryDataGroup } from "@/lib/http/client/responses/SaaobSummaryDataResponse";
export { isLbacSearchGroup } from "@/lib/http/client/responses/LbacSearchResponse";

export type {
  AccountsListResponse,
  ApiResponseException,
  EsreListResponse,
  EsreItemResponse,
  ExpenseClassByOfficeCodeListResponse,
  ExpenseClassResponse,
  ExpenseClassListResponse,
  ExpenseTypeListResponse,
  ExpenseTypeResponse,
  UserResponse,
  EnrollmentEligibilityResponse,
  FundTypesListResponse,
  FundTypeResponse,
  InvitationResponse,
  InvitationListResponse,
  OfficeCodeListResponse,
  OfficeCodeResponse,
  OfficeCodeWithHeadsResponse,
  OfficeResponse,
  OfficeSingleResponse,
  OfficeSingleResponseWithRoleExtendedInfo,
  OfficesExtendedListResponse,
  OfficesListResponse,
  PermissionDefinitionResponse,
  RoleDefinitionResponse,
  UnactivatedListResponse,
  ObrRequestSummaryListResponse,
  ObrRequestSummaryItem,
  ObrRequestDetailResponse,
  ObrRequestDetail,
  ObrRequestDetailItem,
  ObrRequestDetailApprover,
  ObrDisbursementVoucherListResponse,
  ObrDisbursementVoucherItem,
  ObrDisbursementTaxBreakdown,
  ObrItemListResponse,
  ObrItem,
  ObrItemOfficeData,
  ObrSearchResponse,
  ObrSearchItem,
  SupplementalListResponse,
  SupplementalItemResponse,
  AipListResponse,
  AipNodeResponse,
  AipReferenceResponse,
  AipReferenceSingleResponse,
  AipSearchResponse,
  AipSearchResultItem,
  ObrMainDataListResponse,
  ObrMainDataItemResponse,
  ObrMainDataAipReference,
  LbacDataResponse,
  LbacGroupResponse,
  LbacGroupTotals,
  LbacItemResponse,
  LbacAipRef,
  LbacImplementingUnit,
  PpmpDataResponse,
  PpmpMajorGroupResponse,
  PpmpMinorGroupResponse,
  PpmpProjectGroupResponse,
  PpmpPlanItemResponse,
  LbacOfficeQuarterlyResponse,
  LbacQuarterlyGroupResponse,
  LbacQuarterlyGroupTotals,
  LbacQuarterlyItemResponse,
  LbacViewerResponse,
  LbacViewerGroupResponse,
  LbacViewerGroupTotals,
  LbacViewerItemResponse,
  LbacSearchResponse,
  LbacSearchGroupItem,
  LbacSearchResultItem,
  LbacTemplateInfo,
  LbacTemplatesPayload,
  LbacTemplatesResponse,
  SaaobDataResponse,
  SaaobOfficeResponse,
  SaaobEntryResponse,
  SaaobGroupResponse,
  SaaobGroupTotalResponse,
  SaaobSearchResponse,
  SaaobSearchGroup,
  SaaobSearchEntry,
  SaaobSummaryDataResponse,
  SaaobSummaryGroupResponse,
  SaaobSummaryItemResponse,
  SaaobTemplateInfo,
  SaaobTemplatesPayload,
  SaaobTemplatesResponse,
  ProcurementTypesListResponse,
  ProcurementTypeResponse,
  PurchasingItemAip,
  PurchasingItemResponse,
  PurchasingItemSignatory,
  PurchasingListResponse,
  PurchasingValidSignatoriesResponse,
  PurchasingValidSignatory,
  ElecListResponse,
  ElecItemResponse,
  NotificationItemResponse,
  NotificationListResponse,
  TravelOrderListResponse,
  TravelOrderItemResponse,
  TravelOrderRequestorResponse,
  TravelOrderApprovedByResponse,
  TravelOrderUserListResponse,
  TravelOrderUserItemResponse,
};

export interface BetterFetchResponse<TSuccess, TError> {
  data: TSuccess,
  error?: TError
}
