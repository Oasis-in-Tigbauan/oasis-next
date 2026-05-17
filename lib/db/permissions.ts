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

/**
 * People with this permission can approve disbursement item on approved OBRs.
 */
export const OBR_DISBURSEMENT_ACCOUNTANT_APPROVE: Permissions = "obr.disbursement.accountant.approve";

/**
 * People with this permission can approve disbursement item on approved OBRs.
 */
export const OBR_DISBURSEMENT_TREASURER_APPROVE: Permissions = "obr.disbursement.treasurer.approve";

/**
 * People with this permission can approve disbursement item on approved OBRs.
 */
export const OBR_DISBURSEMENT_MAYOR_APPROVE: Permissions = "obr.disbursement.mayor.approve";

/**
 * People with this permission can read ESRE worksheets.
 */
export const ESRE_READ: Permissions = "esre.read";

/**
 * People with this permission can write ESRE worksheets.
 */
export const ESRE_WRITE: Permissions = "esre.write";

/**
 * People with this permission can read Supplemental worksheets.
 */
export const SUPPLEMENTAL_READ: Permissions = "supplemental.read";

/**
 * People with this permission can write Supplemental worksheets.
 */
export const SUPPLEMENTAL_WRITE: Permissions = "supplemental.write";

/**
 * People with this permission can read LBAC Data related worksheets.
 */
export const LBAC_DATA_READ: Permissions = "lbac.data.read";

/**
 * People with this permission can write to LBAC Data related worksheets.
 */
export const LBAC_DATA_WRITE: Permissions = "lbac.data.write";

/**
 * People with this permission can read the Office-specific LBAC Data.
 */
export const LBAC_OFFICE_READ: Permissions = "lbac.office.read";

/**
 * People with this permission can write the Office-specific LBAC Data.
 */
export const LBAC_OFFICE_WRITE: Permissions = "lbac.office.write";

/**
 * People with this permission can read the AIP worksheets.
 */
export const AIP_READ: Permissions = "aip.read";

/**
 * People with this permission can write to the AIP worksheets.
 */
export const AIP_WRITE: Permissions = "aip.write";

/**
 * People with this permission can read SAAOB Main Data entries & summaries
 */
export const SAAOB_DATA_READ: Permissions = "saaob.data.read";

/**
 * People with this permission can write SAAOB Main Data entries & summaries
 */
export const SAAOB_DATA_WRITE: Permissions = "saaob.data.write";

/**
 * People with this permission can read SAAOB office-specific entries.
 */
export const SAAOB_OFFICE_READ: Permissions = "saaob.office.read";

/**
 * People with this permission can create Purchase Requests
 */
export const PURCHASING_REQUEST_CREATE: Permissions = "purchasing.request.create";

/**
 * People with this permission can modify Purchase Requests, and additionally able to produce Purchase Orders.
 */
export const PURCHASING_REQUEST_MANAGE: Permissions = "purchasing.request.manage";

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
    | "obr.disbursement.accountant.approve"
    | "obr.disbursement.treasurer.approve"
    | "obr.disbursement.mayor.approve"
    | "office.head"
    | "esre.read"
    | "esre.write"
    | "supplemental.read"
    | "supplemental.write"
    | "lbac.office.read"
    | "lbac.office.write"
    | "lbac.data.read"
    | "lbac.data.write"
    | "aip.read"
    | "aip.write"
    | "saaob.data.read"
    | "saaob.data.write"
    | "saaob.office.read"
    | "purchasing.request.create"
    | "purchasing.request.manage";
