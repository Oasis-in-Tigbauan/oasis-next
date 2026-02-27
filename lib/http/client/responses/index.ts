import type { AccountsListResponse } from "@/lib/http/client/responses/AccountsListResponse";
import type { ApiResponseException } from "@/lib/http/client/responses/ApiResponseException";
import type { BanResponse } from "@/lib/http/client/responses/BanResponse";
import type { EnrollmentEligibilityResponse } from "@/lib/http/client/responses/EnrollmentEligibilityResponse";
import type { InvitationResponse } from "@/lib/http/client/responses/InvitationResponse";
import type { InvitationListResponse } from "@/lib/http/client/responses/InvitationListResponse";
import type { OfficesListResponse } from "@/lib/http/client/responses/OfficesListResponse";
import type { UnactivatedListResponse } from "@/lib/http/client/responses/UnactivatedListResponse";

export type {
  AccountsListResponse,
  ApiResponseException,
  BanResponse,
  EnrollmentEligibilityResponse,
  InvitationResponse,
  InvitationListResponse,
  OfficesListResponse,
  UnactivatedListResponse,
};

export interface BetterFetchResponse<TSuccess, TError> {
    data: TSuccess,
    error?: TError
}
