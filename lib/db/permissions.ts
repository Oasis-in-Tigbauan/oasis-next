/**
 * People with this role can Approve/Reject or Ban accounts applying on the
 * organization
 */
export const APPROVALS_ACCOUNT_WRITE: Permissions = "approvals.account.write";

/**
 * People with this role can read accounts applying on the organization.
 */
export const APPROVALS_ACCOUNT_READ: Permissions = "approvals.account.read";

/**
 * People with this role can invite people to the organization or revoke pending invitations.
 */
export const APPROVALS_INVITATION_WRITE: Permissions = "approvals.invitation.write";

/**
 * People with this role can read invitations sent to the organization.
 */
export const APPROVALS_INVITATION_READ: Permissions = "approvals.invitation.read";

/**
 * People with this permission can read data types.
 */
export const DATA_TYPES_MANAGE_READ: Permissions = "data-types.manage.read";

/**
 * People with this permission can manage data types.
 */
export const DATA_TYPES_MANAGE_WRITE: Permissions = "data-types.manage.write";

/**
 * People with this permission is the head of the office. It adds no special permissions.
 */
export const OFFICE_HEAD: Permissions = "office.head";

/**
 * People with this permission can manage obr related configurations and main worksheets.
 */
export const OBR_MANAGEMENT_WRITE: Permissions = "obr.management.write";

/**
 * People with this permission can read obr related configurations and main worksheets.
 */
export const OBR_MANAGEMENT_READ: Permissions = "obr.management.read";

/**
 * People with this permission can Approve/Reject OBR Requests with less than 4 Items
 */
export const OBR_APPROVER_BASIC_WRITE: Permissions = "obr.approver.basic.write";

/**
 * People with this permission can see who are Pending to approve OBR Requests with less than 4 Items
 */
export const OBR_APPROVER_BASIC_READ: Permissions = "obr.approver.basic.read";

/**
 * People with this permission can Approve/Reject OBR Requests with more than 4 Items
 */
export const OBR_APPROVER_ADVANCED_WRITE: Permissions = "obr.approver.advanced.write";

/**
 * People with this permission can see who are Pending to approve OBR Requests with more than 4 Items
 */
export const OBR_APPROVER_ADVANCED_READ: Permissions = "obr.approver.advanced.read";

/**
 * People with this permission can Approve/Reject OBR Requests. Exclusive only for a budget officer only.
 */
export const OBR_APPROVER_BASIC_HIGH_WRITE: Permissions = "obr.approver.basic.high.write";

/**
 * People with this permission can create OBR Requests from their office.
 */
export const OBR_REQUEST_CREATE: Permissions = "obr.request.create";

/**
 * People with this permission can read OBR Requests from their office.
 */
export const OBR_REQUEST_READ: Permissions = "obr.request.read";

/**
 * People with this permission can create disbursement item on approved OBRs.
 */
export const OBR_DISBURSEMENT_CREATE: Permissions = "obr.disbursement.create";

export type Permissions =
    | "approvals.account.write"
    | "approvals.account.read"
    | "approvals.invitation.write"
    | "approvals.invitation.read"
    | "data-types.manage.read"
    | "data-types.manage.write"
    | "obr.management.write"
    | "obr.management.read"
    | "obr.approver.basic.write"
    | "obr.approver.basic.read"
    | "obr.approver.basic.high.write"
    | "obr.approver.advanced.write"
    | "obr.approver.advanced.read"
    | "obr.request.create"
    | "obr.request.read"
    | "obr.disbursement.create"
    | "office.head";
