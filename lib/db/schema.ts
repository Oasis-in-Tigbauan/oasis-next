import { relations, sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, boolean, index, decimal, foreignKey, integer, serial, uniqueIndex } from "drizzle-orm/pg-core";
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
    verified: boolean("verified").default(false).notNull(),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

export const appNotifications = pgTable("app_notifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull(),
  scope: text("scope").notNull(),
  entityId: text("entity_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  href: text("href"),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
}, (table) => [
  index("app_notifications_user_idx").on(table.userId),
  index("app_notifications_scope_idx").on(table.scope),
  index("app_notifications_created_idx").on(table.createdAt),
]);

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
  officePositionId: text("office_position_id")
    .references(() => officePosition.id)
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

export const aroOfficeDefinitions = pgTable("aro_office_definitions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull(),
  leadUserId: text("lead_user_id")
    .references(() => user.id)
    .notNull(),

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
  officeId: text("office_id")
    .references(() => office.id),
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
  remarks: text("remarks"),

  // Formula options
  allotmentShouldCopyFromAppropriation: boolean("allotment_should_copy_from_appropriation")
    .default(false)
    .notNull(),

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

export const saaobSummaryOfAccountsGroup = pgTable("saaob_summary_of_accounts_group", {
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

export const saaobSummaryOfAccounts = pgTable("saaob_summary_of_accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),

  parentId: text("parent_id")
    .references(() => saaobSummaryOfAccountsGroup.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const saaobSummaryOfAccountsLinkedGroups = pgTable("saaob_summary_of_accounts_linked_groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  groupRefId: text("group_ref_id")
    .references(() => saaobEntryGroup.id)
    .notNull(),
  entryId: text("entry_id")
    .references(() => saaobSummaryOfAccounts.id)
    .notNull(),
});

export const saaobStatisticGroupTypes = pgEnum("saaob_statistic_groups", ["budget", "sum_per_sector"]);

export const saaobStatisticItems = pgTable("saaob_statistic_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  name: text("name")
    .notNull(),
  type: saaobStatisticGroupTypes("type")
    .notNull(),
  isGroup: boolean("is_group")
    .default(false)
    .notNull(),

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

export const saaobStatisticSelectedGroups = pgTable("saaob_statistic_selected_groups", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  mainItemGroupRefId: text("main_group_ref_id")
    .references(() => saaobEntryGroup.id),
  summaryOfAccountRefId: text("summary_of_account_ref_id")
    .references(() => saaobSummaryOfAccounts.id),

  refId: text("ref_id")
    .references(() => saaobStatisticItems.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  check(
    "check_exclusive_arc",
    sql`(${table.mainItemGroupRefId} IS NOT NULL AND ${table.summaryOfAccountRefId} IS NULL) OR (${table.mainItemGroupRefId} IS NULL AND ${table.summaryOfAccountRefId} IS NOT NULL)`,
  ),
]);

export const obrRequestType = pgEnum("obr_request_type", ["basic", "advanced"]);

export const obrRequests = pgTable("obr_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  requestNumber: text("request_number").notNull(),
  payee: text("payee"),
  officeAddress: text("office_address").notNull(),
  obrNumber: text("obr_number"),
  prNumber: text("pr_number"),
  type: obrRequestType("request_type").notNull(),
  withCheque: boolean("with_cheque").default(true).notNull(),

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
  payee: text("payee"),
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
    .references(() => user.id),
  headUserName: text("head_name"),
  headUserPositionName: text("head_position_name"),

  accountantId: text("accountant_user_id")
    .references(() => user.id),
  accountantName: text("accountant_name"),
  accountantPositionName: text("accountant_position_name"),
  accountantSigningStatus: obrRequestSigningStatus("accountant_signing_status")
    .default("pending")
    .notNull(),
  accountantReason: text("accountant_reason"),
  accountantActedAt: timestamp("accountant_acted_at", { withTimezone: true, mode: "date" }),

  treasurerId: text("treasurer_user_id")
    .references(() => user.id),
  treasurerName: text("treasurer_name"),
  treasurerPositionName: text("treasurer_position_name"),

  mayorId: text("mayor_id")
    .references(() => user.id),
  mayorName: text("mayor_name"),
  mayorPositionName: text("mayor_position_name"),

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

export const obrDisbursementElectronic = pgTable("obr_disbursement_electronic", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  voucherId: text("voucher_id")
    .references(() => obrDisbursementVouchers.id)
    .notNull(),
  billingName: text("billing_name").notNull(),
  meterSerial: text("meter_serial").notNull(),
  account: text("account").notNull(),
  gross: decimal("gross").notNull(),
  vatableSales: decimal("vatable_sales").notNull(),
  taxType: taxTypes("tax_type").notNull(),

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
  payee: text("payee"),
  address: text("address").notNull(),
  particulars: text("particulars").notNull(),

  requestingOfficialId: text("requesting_official_id") // Head of the office?
    .references(() => user.id)
    .notNull(),
  disbursementRefId: text("disbursement_ref_id")
    .references(() => obrDisbursementVouchers.id),
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
  amount: decimal("amount").notNull(),
  supplementalType: supplementalTypeEnum("supplemental_type").notNull(),

  saaobId: text("saaob_id")
    .references(() => saaobEntries.id),
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
  officeId: text("office_id")
    .references(() => office.id),
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

export const aroType = pgEnum("aro_type", ["ps", "mooe", "finex", "capex"]);
export const lbacBudgetType = pgEnum("lbac_budget_type", ["ab", "sb", "rb"]);

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
  aroType: aroType("aro_type"),
  budgetType: lbacBudgetType("budget_type"),

  // References
  implementingUnitId: text("implementing_unit_id")
    .references(() => officeCodes.id),
  expenseCodeId: text("expense_code_id")
    .references(() => expenseClasses.id),
  saaobId: text("saaob_id")
    .references(() => saaobEntries.id),
  aroLink: text("aro_link")
    .references(() => aroOfficeDefinitions.id),

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
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const lbacCollectionPerformanceGroup = pgTable("lbac_collection_performance_group", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  parentId: text("parent_id"),
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

export const lbacCollectionPerformanceData = pgTable("lbac_collection_performance_data", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  particulars: text("particulars").notNull(),
  accountCode: text("account_code"),
  incomeTarget: decimal("income_target").notNull(),
  ic: text("ic"),

  groupId: text("group_id")
    .references(() => lbacCollectionPerformanceGroup.id)
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

export const lbacCollectionPerformanceMonthlyData = pgTable("lbac_collection_performance_monthly_data", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  month: integer("month").notNull(),
  year: integer("year").notNull(),
  quarter: integer("quarter").notNull(),

  value: decimal("value").notNull(),
  dataId: text("data_id")
    .references(() => lbacCollectionPerformanceData.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const lbacMonitoring = pgTable("lbac_monitoring", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  ab: text("ab"),
  actualAccomplishment: text("actual_accomplishment"),
  abEstimatedCost: decimal("ab_estimated_cost"),
  actualExpenditure: decimal("actual_expenditure"),
  remarks: text("remarks"),

  itemId: text("item_id")
    .references(() => lbacItems.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const lbacStatementOfExpenditures = pgTable("lbac_statement_of_expenditures", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  parentId: text("parent_id"),
  particulars: text("particulars")
    .notNull(),
  accountCode: text("account_code"),
  estimate: decimal("estimate"),
  actual: decimal("actual"),
  remarks: text("remarks"),
  forFiscalYear: integer("for_fiscal_year")
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

export const obrMainData = pgTable("obr_main_data", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  obrNumber: text("obr_number").notNull(),
  alobs: text("alobs").notNull(),
  payee: text("payee"),
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
  saaobId: text("saaob_id")
    .references(() => saaobEntries.id),

  // Other metadata
  requestSourceId: text("request_source_id")
    .references(() => obrRequests.id),
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
  payee: text("payee"),
  natureOfPayment: text("nature_of_payment").notNull(),
  amount: decimal("amount").notNull(),
  checkStatus: checkStatusEnum("check_status"),
  remarks: text("remarks"),
  expenseTypeId: text("expense_type_id")
    .references(() => expenseType.id),
  saaobId: text("saaob_id")
    .references(() => saaobEntries.id),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const modeOfProcurements = pgTable("mode_of_procurements", {
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
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
});

export const purchasing = pgTable("purchasing", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  prNumber: text("pr_number").notNull(),
  purchaseOrderNumber: text("purchse_order_number"),
  supplier: text("supplier"),
  address: text("address"),
  tinNumber: text("tin_number"),
  placeOfDelivery: text("place_of_delivery"),
  dateOfDelivery: timestamp("date_of_delivery", { withTimezone: true, mode: "date" }),
  deliveryTerm: text("delivery_term"),
  paymentTerm: text("payment_term"),
  unit: text("unit").notNull(),
  itemDescription: text("item_description").notNull(),
  quantity: decimal("quantity").notNull(),
  unitCost: decimal("unit_cost").notNull(),
  purpose: text("purpose").notNull(),

  headOfOfficeId: text("head_of_office_id")
    .references(() => user.id)
    .notNull(),
  headOfOfficeName: text("head_of_office_name")
    .notNull(),
  headOfOfficePosition: text("head_of_office_position")
    .notNull(),
  procurementId: text("procurement_id")
    .references(() => modeOfProcurements.id),

  treasurerId: text("treasurer_id")
    .references(() => user.id)
    .notNull(),
  approverId: text("approver_id")
    .references(() => user.id)
    .notNull(),
  requestingOfficeId: text("requesting_office_id")
    .references(() => office.id)
    .notNull(),
  requestingUserId: text("requesting_user_id")
    .references(() => user.id)
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const purchasingAip = pgTable("purchasing_aip", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  purchasingId: text("purchasing_id")
    .references(() => purchasing.id, { onDelete: "cascade" })
    .notNull(),

  // Lookup based on AIP Code, but we will use LBAC for reasons.
  lbacReferenceId: text("lbac_reference_id")
    .references(() => lbacItems.id)
    .notNull(),

  // LBAC values are cached here
  aipCode: text("aip_code")
    .notNull(),

  // MFO/PPA
  ppa: text("ppa").notNull(),

  // Derived from lbacItems.expenseCode.accountName + lbacItems.expenseCode.accoutCode
  sourceOfFund: text("source_of_fund"),

  // Amount entry by the user.
  amountCharged: decimal("amount_charged"),
});

export const ppmpMajorGroup = pgTable("ppmp_major_group", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  saaobId: text("saaob_id")
    .references(() => saaobEntries.id)
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const ppmpMinorGroup = pgTable("ppmp_minor_group", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  lbacId: text("lbac_id")
    .references(() => lbacItems.id)
    .notNull(),

  parentId: text("parent_id")
    .references(() => ppmpMajorGroup.id)
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const ppmpProjectGroup = pgTable("ppmp_project_group", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  title: text("title").notNull(),

  parentId: text("parent_id")
    .references(() => ppmpMinorGroup.id)
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const ppmpProjectType = pgEnum("ppmp_project_type", ["goods", "infra", "cons-serv"]);

export const ppmp = pgTable("ppmp", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  generalDescription: text("general_description"),
  typeOfProject: ppmpProjectType("type_of_project")
    .notNull(),
  quantityOrSize: text("quantity_or_size")
    .notNull(),
  recommendedModeOfProcurement: text("recommended_mode_of_procurement"),
  eligibleForPreProcurementConference: boolean("eligible_for_conference")
    .default(false)
    .notNull(),
  startOfProcurementActivity: timestamp("start_of_procurement_activity", { withTimezone: true, mode: "date" })
    .notNull(),
  endOfProcurementActivity: timestamp("end_of_procurement_activity", { withTimezone: true, mode: "date" })
    .notNull(),
  expectedDeliveryPeriod: timestamp("expected_delivery_period", { withTimezone: true, mode: "date" })
    .notNull(),
  saaobId: text("saaob_id")
    .references(() => saaobEntries.id)
    .notNull(),
  estimatedBudget: decimal("estimated_budget")
    .notNull(),
  attachedSupportingDocuments: text("attached_supporting_documents"),
  remarks: text("remarks"),

  // Both are nullable.
  // An item will have a value in ONE of these columns, but not both.
  minorGroupId: text("minor_group_id")
    .references(() => ppmpMinorGroup.id),
  projectGroupId: text("project_group_id")
    .references(() => ppmpProjectGroup.id),

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const travelOrderStatusEnum = pgEnum("travel_order_status", ["co-hr", "filed", "missing", "cancelled"]);
export const travelOrderCategoryEnum = pgEnum("travel_order_category", ["official", "personal"]);
export const leaveCommutationEnum = pgEnum("leave_commutation", ["not-requested", "requested"]);

export const travelOrders = pgTable("travel_orders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  refNumber: serial("ref_number").notNull().unique(),
  travelOrderStatus: travelOrderStatusEnum("travel_order_status").notNull(),
  category: travelOrderCategoryEnum("travel_order_category").notNull(),
  startDate: timestamp("start_date", { withTimezone: true, mode: "date" })
    .notNull(),

  // Not nullable because some travel orders are just a single day.
  endDate: timestamp("end_date", { withTimezone: true, mode: "date" }),
  location: text("location").notNull(),
  purpose: text("purpose").notNull(),
  subjectToClaims: boolean("subject_to_claims").default(true).notNull(),
  notes: text("notes"),

  requestorId: text("requestor_id")
    .references(() => user.id)
    .notNull(),
  requestorOfficeId: text("requestor_office_id")
    .references(() => office.id)
    .notNull(),
  requestorPositionId: text("requestor_office_position")
    .references(() => officePosition.id)
    .notNull(),
  approverId: text("approver_id")
    .references(() => user.id),
  approverPositionId: text("approver_office_position")
    .references(() => officePosition.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const leaveApplications = pgTable("leave_applications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  refNumber: serial("ref_number").notNull().unique(),
  lastName: text("last_name").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  dateOfFiling: text("date_of_filing").notNull(),
  position: text("position").notNull(),
  monthlySalary: decimal("monthly_salary").notNull(),
  leaveTypes: text("leave_types").array().notNull(),
  otherLeaveDescription: text("other_leave_description"),
  vacationLocation: text("vacation_location"),
  vacationLocationDetails: text("vacation_location_details"),
  sickLocation: text("sick_location"),
  illnessDetails: text("illness_details"),
  studyPurpose: text("study_purpose"),
  otherPurposes: text("other_purposes").array().notNull(),
  workingDays: text("working_days").notNull(),
  leaveStartDate: text("leave_start_date").notNull(),
  commutation: leaveCommutationEnum("commutation").notNull(),
  approvedBy: text("approved_by"),
  approvedByPosition: text("approved_by_position"),

  requestorId: text("requestor_id")
    .references(() => user.id)
    .notNull(),
  requestorOfficeId: text("requestor_office_id")
    .references(() => office.id)
    .notNull(),
  requestorPositionId: text("requestor_office_position")
    .references(() => officePosition.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const payrolls = pgTable("payrolls", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  payrollNo: text("payroll_no").notNull().unique(),
  payrollMonth: text("payroll_month").notNull(),
  purpose: text("purpose").notNull(),
  periodCovered: text("period_covered").notNull(),
  lgu: text("lgu").notNull(),
  fund: text("fund").notNull(),
  sheetNumber: integer("sheet_number").default(1).notNull(),
  totalSheets: integer("total_sheets").default(1).notNull(),
  authorizedOfficial: text("authorized_official").notNull(),
  headOfAccounting: text("head_of_accounting").notNull(),
  headOfTreasury: text("head_of_treasury").notNull(),
  localChiefExecutive: text("local_chief_executive").notNull(),
  disbursingOfficer: text("disbursing_officer").notNull(),
  cafaoNo: text("cafao_no"),
  cafaoDate: text("cafao_date"),
  createdById: text("created_by_id")
    .references(() => user.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const payrollEntries = pgTable("payroll_entries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  payrollId: text("payroll_id")
    .references(() => payrolls.id)
    .notNull(),
  serialNo: integer("serial_no").notNull(),
  name: text("name").notNull(),
  position: text("position").notNull(),
  idNo: text("id_no"),
  amount: decimal("amount").notNull(),
  signatureNo: integer("signature_no").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const templateType = pgEnum("template_type", ["header", "footer"]);

export const templateBucket = pgTable("template_bucket", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),

  identifier: text("identifier").notNull(),
  templatePath: text("template_path").notNull(),
  templateType: templateType("template_type").notNull(),

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
