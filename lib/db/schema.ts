import { relations, sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, boolean, index, decimal, foreignKey, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

export const office = pgTable("office", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  prohibitedAssignment: boolean("prohibited_assignment").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const officePosition = pgTable("office_position", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  permissions: text("permissions")
    .array()
    .notNull()
    // language=text
    .default(sql`ARRAY[]::text[]`),
  officeId: text("office_id")
    .references(() => office.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  banned: boolean("banned").default(false).notNull(),
  shadowBanned: boolean("shadow_banned").default(false).notNull(),
  officeId: text("office_id")
    .references(() => office.id)
    .notNull(),
  officePositionId: text("office_position_id")
    .references(() => officePosition.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
}, (table) => [
  index("users_office_idx").on(table.officeId),
  index("users_position_idx").on(table.officePositionId),
]);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

export const invitations = pgTable("invitations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  email: text("email").notNull().unique(),
  validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }).notNull(),
  consumed: boolean("consumed").default(false).notNull(),
  token: text("token").notNull().unique(),
  officeId: text("office_id")
    .references(() => office.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const expenseClasses = pgTable("expense_classes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  accountName: text("account_name").notNull(),
  fpp: text("fpp"),
  classification: text("classification"),
  subClassification: text("sub_classification"),
  group: text("group"),
  accountCode: text("account_code"),
  class: text("class"),

  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const expenseClassOfficeCodes = pgTable("expense_classes_office_codes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  expenseClassId: text("expense_name_id")
    .references(() => expenseClasses.id)
    .notNull(),
  officeCodeId: text("office_code_id")
    .references(() => officeCodes.id)
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
}, (table) => [
  uniqueIndex("expense_names_office_codes_unique").on(table.expenseClassId, table.officeCodeId),
]);

export const officeCodes = pgTable("office_codes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  aa: text("aa").notNull(),
  code: text("code"),
  sector: text("sector"),
  function: text("function"),
  liftOffice: text("lift_office"),
  subOffice: text("sub_office"),

  officeId: text("office_id")
    .references(() => office.id)
    .notNull(),
  headUserId: text("head_user_id")
    .references(() => user.id)
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const fundTypes = pgTable("fund_types", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  name: text("name").notNull(),
  description: text("description"),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const expenseType = pgTable("expense_type", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  name: text("name").notNull(),
  description: text("description"),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const obrRequestType = pgEnum("obr_request_type", ["basic", "advanced"]);

export const obrRequests = pgTable("obr_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  requestNumber: text("request_number").notNull(),
  payee: text("payee").notNull(),
  officeAddress: text("office_address").notNull(),
  obrNumber: text("obr_number"),
  prNumber: text("pr_number"),
  type: obrRequestType("request_type").notNull(),

  publisherId: text("publisher_id")
    .references(() => user.id)
    .notNull(),
  originatingOfficeId: text("originating_office_id")
    .references(() => office.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const obrRequestItems = pgTable("obr_request_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  particulars: text("particulars").notNull(),
  amount: decimal("amount").notNull(),

  requestId: text("request_id")
    .references(() => obrRequests.id)
    .notNull(),
  responsibilityCenterId: text("reponsibility_center_id")
    .references(() => officeCodes.id)
    .notNull(),
  expenseCodeId: text("expense_code_id")
    .references(() => expenseClasses.id)
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const obrRequestSigningStatus = pgEnum("obr_request_signing_status", ["pending", "approved", "binned"]);

export const obrRequestApprovers = pgTable("obr_request_approvers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  requestId: text("request_id")
    .references(() => obrRequests.id)
    .notNull(),
  positionId: text("position_id")
    .references(() => officePosition.id)
    .notNull(),

  status: obrRequestSigningStatus("signing_status").notNull(),
  reason: text("reason"),

  actedUserId: text("acted_user_id")
    .references(() => user.id),
  actedAt: timestamp("acted_at", { withTimezone: true, mode: "date" }),
});

export const disbursementStatuses = pgEnum("disbursement_statuses", [
  "PREPARATION",
  "PROCESSING",
  "ON HOLD",
  "FOR RELEASE",
  "PAID",
]);
export const taxTypes = pgEnum("tax_types", ["vat-g", "vat-s", "nvat-g", "nvat-s"]);

export const obrDisbursementVouchers = pgTable("obr_disbursement_vouchers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  disbursementVoucherNumber: text("disbursement_voucher_number")
    .notNull(),
  payee: text("payee")
    .notNull(),
  address: text("address")
    .notNull(),
  particulars: text("particulars")
    .notNull(),
  prNumber: text("pr_number"),
  grossAmount: decimal("gross_amount"),
  vatableAmount: decimal("vatable_amount"),
  taxType: taxTypes("tax_type"),
  status: disbursementStatuses("status"),
  responsibilityCenterId: text("reponsibility_center_id")
    .references(() => officeCodes.id)
    .notNull(),

  // Signers
  headUserId: text("head_user_id")
    .references(() => user.id)
    .notNull(),
  headUserName: text("head_name").notNull(),
  headUserPositionName: text("head_position_name").notNull(),

  accountantId: text("accountant_user_id")
    .references(() => user.id)
    .notNull(),
  accountantName: text("accountant_name").notNull(),
  accountantPositionName: text("accountant_position_name").notNull(),

  treasurerId: text("treasurer_user_id")
    .references(() => user.id)
    .notNull(),
  treasurerName: text("treasurer_name").notNull(),
  treasurerPositionName: text("treasurer_position_name").notNull(),

  mayorId: text("mayor_id")
    .references(() => user.id)
    .notNull(),
  mayorName: text("mayor_name").notNull(),
  mayorPositionName: text("mayor_position_name").notNull(),

  fundTypeId: text("fund_type_id")
    .references(() => fundTypes.id),
  requestId: text("request_id")
    .references(() => obrRequests.id)
    .notNull(),
  requestItemId: text("request_item_id")
    .references(() => obrRequestItems.id)
    .notNull(),
  disbursedBy: text("disbursed_by")
    .references(() => user.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const obrItems = pgTable("obr_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  payee: text("payee").notNull(),
  address: text("address").notNull(),
  particulars: text("particulars").notNull(),

  requestingOfficialId: text("requesting_official_id") // Head of the office?
    .references(() => user.id)
    .notNull(),
  disbursementRefId: text("disbursement_ref_id")
    .references(() => obrDisbursementVouchers.id)
    .notNull(),
  publishedBy: text("disbursed_by")
    .references(() => user.id)
    .notNull(),
  requestId: text("request_id")
    .references(() => obrRequests.id)
    .notNull(),
  requestItemId: text("request_item_id")
    .references(() => obrRequestItems.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const obrOfficeItem = pgTable("obr_office_item", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  amount: decimal("amount").notNull(),
  responsibilityCenterId: text("reponsibility_center_id")
    .references(() => officeCodes.id)
    .notNull(),
  expenseCodeId: text("expense_code_id")
    .references(() => expenseClasses.id)
    .notNull(),
  itemId: text("item_id")
    .references(() => obrItems.id)
    .notNull(),
});

export const supplementalTypeEnum = pgEnum("supplemental_type", [
  "less",
  "add",
]);

export const supplemental = pgTable("supplemental", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  supplementalOrAugmentation: text("supplemental_or_augmentation"),
  charges: text("charges"),
  amount: decimal("amount").notNull(),
  supplementalType: supplementalTypeEnum("supplemental_type").notNull(),

  aipRefCode: text("aip_ref_code")
    .references(() => aipReferences.id),
  author: text("author_id")
    .references(() => user.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const aipReferenceType = pgEnum("aip_reference_type", ["group", "item"]);

export const aipReferences = pgTable("aip_references", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  type: aipReferenceType("type").notNull(),
  parentId: text("parent_id"),
  sector: text("sector"),
  code: text("code"),
  office: text("office"),
  aipReferenceCode: text("aip_reference_code").notNull(),
  description: text("description").notNull(),
  implementingOffice: text("implementing_office"),
  implementationStart: integer("implementation_start"),
  implementationCompletion: integer("implementation_completion"),
  expectedOutputs: text("expected_outputs"),
  fundingSource: text("funding_source"),
  amountPS: decimal("amount_ps"),
  amountMOOE: decimal("amount_mooe"),
  amountCO: decimal("amount_co"),
  amountCCAdapt: decimal("amount_cc_adapt"),
  amountCCMitigate: decimal("amount_cc_mitigate"),
  ccTopologyCode: text("cc_topology_code"),
  gadable: boolean("gadable").default(false).notNull(),
  gadAmount: decimal("gad_amount"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const lbacGroups = pgTable("lbac_groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  aipRefCode: text("aip_ref_code")
    .references(() => aipReferences.id),
  name: text("name").notNull(),
  implementingUnitId: text("implementing_unit_id")
    .references(() => officeCodes.id),

  // Other metadata fields
  officeId: text("office_id")
    .references(() => office.id)
    .notNull(),

  // Groupings
  parentId: text("parent_id"),

  // Creation metadata
  authorId: text("author_id")
    .references(() => user.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
  }),
]);

export const lbacQuarterlyReport = pgTable("lbac_quarterly_report", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  priorYearAccomplishments: text("prior_year_accomplishments"),
  physicalTargetQ1: text("physical_target_q1"),
  physicalTargetQ2: text("physical_target_q2"),
  physicalTargetQ3: text("physical_target_q3"),
  physicalTargetQ4: text("physical_target_q4"),
  physicalTargetTotal: text("physical_target_total"),
  actualPhysicalPerformanceQ1: text("actual_physical_performance_q1"),
  actualPhysicalPerformanceQ2: text("actual_physical_performance_q2"),
  actualPhysicalPerformanceQ3: text("actual_physical_performance_q3"),
  actualPhysicalPerformanceQ4: text("actual_physical_performance_q4"),
  actualPhysicalPerformanceTotal: text("actual_physical_performance_total"),
  variance: text("variance"),
  accomplishmentPercentage: text("accomplishment_percentage"),
  remarks: text("remarks"),
  targetForBudgetYear: text("target_for_budget_year"),

  // Other metadata
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const lbacItems = pgTable("lbac_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  // Main data
  aipRefCode: text("aip_ref_code")
    .references(() => aipReferences.id),
  mfoPpa: text("mfo_ppa").notNull(),
  majorFinalOutput: text("major_final_output"),
  performanceOutputIndicator: text("performance_output_indicator"),
  targetForBudgetYear: text("target_for_budget_year"),
  proposedBudgetPS: decimal("proposed_budget_ps").notNull(),
  proposedBudgetMOOE: decimal("proposed_budget_mooe").notNull(),
  proposedBudgetFE: decimal("proposed_budget_fe").notNull(),
  proposedBudgetCO: decimal("proposed_budget_co").notNull(),
  remarks: text("remarks"),
  remarksForAllocation: text("remarks_for_allocations"),

  // Other metadata?
  gadable: boolean("gadable").default(false).notNull(),
  tagging: text("tagging"),
  amountAttributed: decimal("ammount_attributed"),
  physicalTargets: text("physical_targets"),
  priorYearAccomplishments: text("prior_year_accomplishments"),
  remarksForOtherMetadata: text("remarks_for_other_metadata"),

  // References
  implementingUnitId: text("implementing_unit_id")
    .references(() => officeCodes.id),
  expenseCodeId: text("expense_code_id")
    .references(() => expenseClasses.id),

  // Quarterly Reports
  quarterlyReportId: text("lbac_quarterly_report")
    .references(() => lbacQuarterlyReport.id)
    .notNull(),

  // Parent
  parentId: text("parent_id")
    .references(() => lbacGroups.id)
    .notNull(),

  // Table metadata
  authorId: text("author_id")
    .references(() => user.id)
    .notNull(),
  officeId: text("office_id")
    .references(() => office.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const obrMainData = pgTable("obr_main_data", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  obrNumber: text("obr_number").notNull(),
  alobs: text("alobs").notNull(),
  payee: text("payee").notNull(),
  address: text("address").notNull(),
  prNumber: text("pr_number"),
  particulars: text("particulars").notNull(),
  obligated: decimal("obligated").notNull(),
  prAmount: decimal("pr_amount"),
  remarks: text("remarks"),

  responsibilityCenterId: text("responsibility_center_id")
    .references(() => officeCodes.id)
    .notNull(),
  expenseCodeId: text("expense_code_id")
    .references(() => expenseClasses.id)
    .notNull(),

  // Other metadata
  requestSourceId: text("request_source_id")
    .references(() => obrRequests.id)
    .notNull(),
  authorId: text("author_id")
    .references(() => user.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const obrMainAipReferences = pgTable("obr_main_aip_references", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  aipReferenceId: text("aip_reference_id")
    .references(() => aipReferences.id),
  aipReferenceCode: text("aip_reference_code"),
  aipDescription: text("aip_description"),
  amount: decimal("amount"),

  // Other metadata
  index: integer("idx").notNull(),
  obrId: text("obr_id")
    .references(() => obrMainData.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const checkStatusEnum = pgEnum("check_status_enum", [
  "PAID",
  "FOR RELEASE",
  "ON HOLD",
  "CANCELLED",
]);

export const esre = pgTable("esre", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  checkNumber: text("check_number"),
  fundingSourceId: text("funding_source_id")
    .references(() => fundTypes.id)
    .notNull(),
  dvOrPayrollNumber: text("dv_or_payroll_number"),
  obrItemId: text("obr_item_id")
    .references(() => obrMainData.id),
  payee: text("payee").notNull(),
  natureOfPayment: text("nature_of_payment").notNull(),
  amount: decimal("amount").notNull(),
  checkStatus: checkStatusEnum("check_status"),
  charges: text("charges"),
  remarks: text("remarks"),
  expenseTypeId: text("expense_type_id")
    .references(() => expenseType.id),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const saaobEntryGroup = pgTable("saaob_entry_group", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),

  parentId: text("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
  }),
]);

export const saaobEntries = pgTable("saaob_entries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  accountCode: text("account_code"),
  annualBudget: decimal("annual_budget")
    .notNull(),
  refCode: text("ref_code"),

  parentId: text("parent_id")
    .references(() => saaobEntryGroup.id)
    .notNull(),
  expenseCodeId: text("expense_code")
    .references(() => expenseClasses.id),
  authorId: text("author_id")
    .references(() => user.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  twoFactors: many(twoFactor),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));
