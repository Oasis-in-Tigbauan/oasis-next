import { GenericOKResponse } from "@/lib/http/client/responses/GenericOKResponse";

type Response = {
    id: string;
    token: string;
    officeId: string;
    officeName: string;
    assignablePositions: Array<{ id: string; name: string; }>;
}

export type EnrollmentEligibilityResponse = GenericOKResponse<Response>
