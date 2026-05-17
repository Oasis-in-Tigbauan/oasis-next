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
    permission: permissions.OBR_APPROVER_BASIC_HIGH_WRITE,
    description: "Similar to the obr.approver.basic.read permission, but for Budget Officers.",
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
  {
    permission: permissions.OBR_REQUEST_CREATE,
    description: "People with this permission can create OBR Requests from their office.",
  },
  {
    permission: permissions.OBR_REQUEST_READ,
    description: "People with this permission can read OBR Requests from their office.",
  },
  {
    permission: permissions.OBR_DISBURSEMENT_CREATE,
    description: "People with this permission can create disbursement item on approved OBRs.",
  },
  {
    permission: permissions.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE,
    description: "People with this permission can approve disbursement item on approved OBRs. (For Accountants)",
  },
  {
    permission: permissions.OBR_DISBURSEMENT_TREASURER_APPROVE,
    description: "People with this permission can approve disbursement item on approved OBRs. (For Treasurers)",
  },
  {
    permission: permissions.OBR_DISBURSEMENT_MAYOR_APPROVE,
    description: "People with this permission can approve disbursement item on approved OBRs. (For Mayors)",
  },
  {
    permission: permissions.ESRE_READ,
    description: "People with this permission can read ESRE related data.",
  },
  {
    permission: permissions.ESRE_WRITE,
    description: "People with this permission can write ESRE related data.",
  },
  {
    permission: permissions.SUPPLEMENTAL_READ,
    description: "People with this permission can read Supplemental related data.",
  },
  {
    permission: permissions.SUPPLEMENTAL_WRITE,
    description: "People with this permission can write Supplemental related data.",
  },
  {
    permission: permissions.LBAC_DATA_READ,
    description: "People with this permission can read LBAC Data related worksheets.",
  },
  {
    permission: permissions.LBAC_DATA_WRITE,
    description: "People with this permission can write to LBAC Data related worksheets.",
  },
  {
    permission: permissions.LBAC_OFFICE_READ,
    description: "People with this permission can read the Office specific LBAC Data.",
  },
  {
    permission: permissions.LBAC_OFFICE_WRITE,
    description: "People with this permission can write to Office specific LBAC Data.",
  },
  {
    permission: permissions.AIP_READ,
    description: "People with this permission can read AIP related worksheets.",
  },
  {
    permission: permissions.AIP_WRITE,
    description: "People with this permission can write to AIP related worksheets.",
  },
  {
    permission: permissions.SAAOB_DATA_READ,
    description: "People with this permission can read SAAOB Main Data entries & summaries",
  },
  {
    permission: permissions.SAAOB_DATA_WRITE,
    description: "People with this permission can write SAAOB Main Data entries & summaries",
  },
  {
    permission: permissions.SAAOB_OFFICE_READ,
    description: "People with this permission can read SAAOB office-specific entries.",
  },
  {
    permission: permissions.PURCHASING_REQUEST_CREATE,
    description: "People with this permission can create Purchase Requests",
  },
  {
    permission: permissions.PURCHASING_REQUEST_MANAGE,
    description: "People with this permission can modify Purchase Requests, and additionally able to produce Purchase Orders.",
  },
  {
    permission: permissions.PPMP_READ,
    description: "People with this permission can read Project Procurement Management Plan (PPMP)",
  },
  {
    permission: permissions.PPMP_MANAGE,
    description: "People with this permission can manage Project Procurement Management Plan (PPMP)",
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
    permissions.OBR_APPROVER_BASIC_HIGH_WRITE,
    permissions.OBR_APPROVER_ADVANCED_WRITE,
    permissions.OBR_APPROVER_ADVANCED_READ,
    permissions.OBR_REQUEST_CREATE,
    permissions.OBR_REQUEST_READ,
    permissions.OBR_DISBURSEMENT_CREATE,
    permissions.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE,
    permissions.OBR_DISBURSEMENT_TREASURER_APPROVE,
    permissions.OBR_DISBURSEMENT_MAYOR_APPROVE,
    permissions.OFFICE_HEAD,
    permissions.ESRE_READ,
    permissions.ESRE_WRITE,
    permissions.SUPPLEMENTAL_READ,
    permissions.SUPPLEMENTAL_WRITE,
    permissions.LBAC_DATA_READ,
    permissions.LBAC_DATA_WRITE,
    permissions.LBAC_OFFICE_READ,
    permissions.LBAC_OFFICE_WRITE,
    permissions.AIP_READ,
    permissions.AIP_WRITE,
    permissions.SAAOB_DATA_READ,
    permissions.SAAOB_DATA_WRITE,
    permissions.SAAOB_OFFICE_READ,
    permissions.PURCHASING_REQUEST_CREATE,
    permissions.PURCHASING_REQUEST_MANAGE,
    permissions.PPMP_READ,
    permissions.PPMP_MANAGE,
  ],
);

type PermissionDescriptor = {
  permission: permissions.Permissions;
  description: string;
  note?: string;
}
