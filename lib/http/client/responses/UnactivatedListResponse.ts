import type {User} from '@/lib/accounts';
import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type UnactivatedListResponse = GenericOkResponse<Array<User>>;
