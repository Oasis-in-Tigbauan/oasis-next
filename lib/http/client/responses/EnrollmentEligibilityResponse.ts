import { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

type Response = {
    id: string;
    token: string;
    officeId: string;
    officeName: string;
    assignablePositions: Array<{ id: string; name: string; }>;
}

export type EnrollmentEligibilityResponse = GenericOkResponse<Response>
