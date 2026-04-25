import * as permissions from "@/lib/db/permissions";

export const permissionDescriptors: Array<PermissionDescriptor> = [
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
    permission: permissions.DATA_TYPES_MANAGE_READ,
    description: "People with this role can view data types.",
  },
  {
    permission: permissions.DATA_TYPES_MANAGE_WRITE,
    description: "People with this role can create, edit, and delete data types.",
  },
  {
    permission: permissions.OBR_MANAGEMENT_WRITE,
    description: "People with this permission can manage obr related configurations and main worksheets.",
  },
  {
    permission: permissions.OBR_MANAGEMENT_READ,
    description: "People with this permission can read obr related configurations and main worksheets.",
  },
  {
    permission: permissions.OBR_APPROVER_BASIC_WRITE,
    description: "People with this permission can Approve/Reject OBR Requests with less than 4 Items",
  },
  {
    permission: permissions.OBR_APPROVER_BASIC_READ,
    description: "People with this permission can see who are Pending for Approval of OBR Requests with less than 4 Items",
  },
  {
    permission: permissions.OBR_APPROVER_ADVANCED_WRITE,
    description: "People with this permission can Approve/Reject OBR Requests with more than 4 Items",
  },
  {
    permission: permissions.OBR_APPROVER_ADVANCED_READ,
    description: "People with this permission can see who are Pending for Approval of OBR Requests with more than 4 Items",
  },
  {
    permission: permissions.OFFICE_HEAD,
    description: "People with this permission indicates that they are head of the office. It adds no special permissions.",
  },
];

export const allowedPermissions: Set<permissions.Permissions> = new Set(
  [
    permissions.APPROVALS_ACCOUNT_WRITE,
    permissions.APPROVALS_ACCOUNT_READ,
    permissions.APPROVALS_INVITATION_WRITE,
    permissions.APPROVALS_INVITATION_READ,
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
    permissions.OBR_MANAGEMENT_WRITE,
    permissions.OBR_MANAGEMENT_READ,
    permissions.OBR_APPROVER_BASIC_WRITE,
    permissions.OBR_APPROVER_BASIC_READ,
    permissions.OBR_APPROVER_ADVANCED_WRITE,
    permissions.OBR_APPROVER_ADVANCED_READ,
    permissions.OFFICE_HEAD,
  ],
);

type PermissionDescriptor = {
  permission: permissions.Permissions;
  description: string;
  note?: string;
}
