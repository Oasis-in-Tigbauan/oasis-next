import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";
import type { User } from "@/lib/accounts";

export type UnactivatedListResponse = GenericOkResponse<Array<User>>;
