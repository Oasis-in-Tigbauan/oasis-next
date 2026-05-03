import { relations, sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, boolean, index, decimal } from "drizzle-orm/pg-core";
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

  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

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
