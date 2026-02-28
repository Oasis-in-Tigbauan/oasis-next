import type { AccountsListResponse } from "@/lib/http/client/responses/AccountsListResponse";
import type { ApiResponseException } from "@/lib/http/client/responses/ApiResponseException";
import type { UserResponse } from "@/lib/http/client/responses/UserResponse";
import type { EnrollmentEligibilityResponse } from "@/lib/http/client/responses/EnrollmentEligibilityResponse";
import type { InvitationResponse } from "@/lib/http/client/responses/InvitationResponse";
import type { InvitationListResponse } from "@/lib/http/client/responses/InvitationListResponse";
import type { OfficeSingleResponse} from "@/lib/http/client/responses/OfficeSingleResponse";
import type { OfficesExtendedListResponse } from "@/lib/http/client/responses/OfficesExtendedListResponse";
import type { OfficesListResponse } from "@/lib/http/client/responses/OfficesListResponse";
import type { UnactivatedListResponse } from "@/lib/http/client/responses/UnactivatedListResponse";

export type {
  AccountsListResponse,
  ApiResponseException,
  UserResponse,
  EnrollmentEligibilityResponse,
  InvitationResponse,
  InvitationListResponse,
  OfficeSingleResponse,
  OfficesExtendedListResponse,
  OfficesListResponse,
  UnactivatedListResponse,
};

export interface BetterFetchResponse<TSuccess, TError> {
    data: TSuccess,
    error?: TError
}
