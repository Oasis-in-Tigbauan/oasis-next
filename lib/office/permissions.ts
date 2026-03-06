import * as permissions from "@/lib/db/permissions";

export const permissionDescriptors: Array<PermissionDescriptor> = [
  {
    permission: permissions.APPROVALS_HEAD_WRITE,
    description: "Head of the offices can approve Obligations published.",
  },
  {
    permission: permissions.APPROVALS_HEAD_READ,
    description: "Head of the offices can read Obligations published that requires their approval.",
  },
  {
    permission: permissions.APPROVALS_ACCOUNT_WRITE,
    description: "People with this role can Approve/Reject, Ban on the organization.",
  },
  {
    permission: permissions.APPROVALS_ACCOUNT_READ,
    description: "People with this role can see who are Pending for Approval and Members of the organization.",
  },
  {
    permission: permissions.APPROVALS_INVITATION_WRITE,
    description: "People with this role can invite people or revoke invitations to the organization.",
    note: "Invited people may need to be approved.",
  },
  {
    permission: permissions.APPROVALS_INVITATION_READ,
    description: "People with this role can see who are Pending for Invitation.",
  },
  {
    permission: permissions.ESRE_READ,
    description: "People with this role can view ESRE items.",
  },
  {
    permission: permissions.ESRE_WRITE,
    description: "People with this role can create, edit, and delete ESRE items.",
  },
];

export const allowedPermissions: Set<permissions.Permissions> = new Set(
  [
    permissions.APPROVALS_HEAD_WRITE,
    permissions.APPROVALS_HEAD_READ,
    permissions.APPROVALS_ACCOUNT_WRITE,
    permissions.APPROVALS_ACCOUNT_READ,
    permissions.APPROVALS_INVITATION_WRITE,
    permissions.APPROVALS_INVITATION_READ,
    permissions.ESRE_READ,
    permissions.ESRE_WRITE,
  ],
);

type PermissionDescriptor = {
  permission: permissions.Permissions;
  description: string;
  note?: string;
}
