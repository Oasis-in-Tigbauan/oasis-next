import type { AccountsListResponse } from "@/lib/http/client/responses/AccountsListResponse";
import type { ApiResponseException } from "@/lib/http/client/responses/ApiResponseException";
import type { ExpenseClassResponse } from "@/lib/http/client/responses/ExpenseClassResponse";
import type { ExpenseClassListResponse } from "@/lib/http/client/responses/ExpenseClassListResponse";
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

export type {
  AccountsListResponse,
  ApiResponseException,
  ExpenseClassResponse,
  ExpenseClassListResponse,
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
};

export interface BetterFetchResponse<TSuccess, TError> {
    data: TSuccess,
    error?: TError
}
