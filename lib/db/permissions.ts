/**
 * Head of the offices can approve Obligations published.
 */
export const APPROVALS_HEAD_WRITE: Permissions = "approvals.head.write";

/**
 * Head of the offices can read Obligations published that requires their
 * approval.
 */
export const APPROVALS_HEAD_READ: Permissions = "approvals.head.read";

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

export type Permissions =
    | "approvals.head.write"
    | "approvals.head.read"
    | "approvals.account.write"
    | "approvals.account.read"
    | "approvals.invitation.write"
    | "approvals.invitation.read";
