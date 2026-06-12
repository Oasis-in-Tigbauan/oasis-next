import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { DateTime } from "luxon";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { User } from "@/lib/accounts";
import { db } from "@/lib/db";
import { payrollEntries, payrolls } from "@/lib/db/schema";
import { ErrorCodes, Failure, type Result, Success } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

export type PayrollEntryPayload = {
  name: string;
  position: string;
  idNo?: string;
  amount: string;
};

export type PayrollPayload = {
  payrollNo: string;
  payrollMonth: string;
  purpose?: string;
  periodCovered?: string;
  lgu: string;
  fund: string;
  sheetNumber: string;
  totalSheets: string;
  authorizedOfficial: string;
  headOfAccounting: string;
  headOfTreasury: string;
  localChiefExecutive: string;
  disbursingOfficer: string;
  cafaoNo?: string;
  cafaoDate?: string;
  entries: PayrollEntryPayload[];
};

export type PayrollEntryItem = PayrollEntryPayload & {
  id: string;
  serialNo: number;
  signatureNo: number;
};

export type PayrollItem = Omit<PayrollPayload, "entries"> & {
  id: string;
  date: string;
  totalAmount: string;
  entries: PayrollEntryItem[];
};

type PayrollRow = typeof payrolls.$inferSelect;
type PayrollEntryRow = typeof payrollEntries.$inferSelect;

function _formatAmount(value: string | number): string {
  return new Decimal(value || 0).toFixed(2);
}

function _sumEntries(entries: Array<{ amount: string }>): string {
  return entries
    .reduce((total, entry) => total.plus(new Decimal(entry.amount || 0)), new Decimal(0))
    .toFixed(2);
}

function _mapPayroll(row: PayrollRow, entries: PayrollEntryRow[]): PayrollItem {
  const mappedEntries = entries
    .sort((a, b) => a.serialNo - b.serialNo)
    .map(entry => ({
      id: entry.id,
      serialNo: entry.serialNo,
      signatureNo: entry.signatureNo,
      name: entry.name,
      position: entry.position,
      idNo: entry.idNo ?? undefined,
      amount: _formatAmount(entry.amount),
    }));

  return {
    id: row.id,
    date: DateTime.fromJSDate(row.createdAt, { zone: "UTC" }).setZone("Asia/Manila").toISO()!,
    payrollNo: row.payrollNo,
    payrollMonth: row.payrollMonth,
    purpose: row.purpose,
    periodCovered: row.periodCovered,
    lgu: row.lgu,
    fund: row.fund,
    sheetNumber: String(row.sheetNumber),
    totalSheets: String(row.totalSheets),
    authorizedOfficial: row.authorizedOfficial,
    headOfAccounting: row.headOfAccounting,
    headOfTreasury: row.headOfTreasury,
    localChiefExecutive: row.localChiefExecutive,
    disbursingOfficer: row.disbursingOfficer,
    cafaoNo: row.cafaoNo ?? undefined,
    cafaoDate: row.cafaoDate ?? undefined,
    totalAmount: _sumEntries(mappedEntries),
    entries: mappedEntries,
  };
}

function _validatePayroll(payload: PayrollPayload): Failure | null {
  const required = [
    payload.payrollNo,
    payload.payrollMonth,
    payload.lgu,
    payload.fund,
    payload.sheetNumber,
    payload.totalSheets,
    payload.authorizedOfficial,
    payload.headOfAccounting,
    payload.headOfTreasury,
    payload.localChiefExecutive,
    payload.disbursingOfficer,
  ];

  if (required.some(value => !validatorUtilities.isNotEmpty(value))) {
    return new Failure(ErrorCodes.ValidationFailure, "Payroll header fields are required.", { payload });
  }

  if (!DateTime.fromFormat(payload.payrollMonth, "yyyy-MM").isValid) {
    return new Failure(ErrorCodes.ValidationFailure, "Payroll month must use YYYY-MM format.", { payrollMonth: payload.payrollMonth });
  }

  if (!Number.isInteger(Number(payload.sheetNumber)) || Number(payload.sheetNumber) < 1) {
    return new Failure(ErrorCodes.ValidationFailure, "Sheet number must be a whole number greater than zero.", { sheetNumber: payload.sheetNumber });
  }

  if (!Number.isInteger(Number(payload.totalSheets)) || Number(payload.totalSheets) < 1) {
    return new Failure(ErrorCodes.ValidationFailure, "Total sheets must be a whole number greater than zero.", { totalSheets: payload.totalSheets });
  }

  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    return new Failure(ErrorCodes.ValidationFailure, "At least one payroll entry is required.", { payload });
  }

  const invalidEntry = payload.entries.find(entry =>
    !validatorUtilities.isNotEmpty(entry.name)
    || !validatorUtilities.isNotEmpty(entry.position)
    || !validatorUtilities.isNumber(entry.amount, false, false)
    || new Decimal(entry.amount).isNegative(),
  );

  if (invalidEntry) {
    return new Failure(ErrorCodes.ValidationFailure, "Each payroll entry requires name, position, and a valid amount.", { invalidEntry });
  }

  return null;
}

function _payrollValues(payload: PayrollPayload): Partial<typeof payrolls.$inferInsert> {
  return {
    payrollNo: payload.payrollNo,
    payrollMonth: payload.payrollMonth,
    purpose: payload.purpose ?? "",
    periodCovered: payload.periodCovered ?? "",
    lgu: payload.lgu,
    fund: payload.fund,
    sheetNumber: Number(payload.sheetNumber),
    totalSheets: Number(payload.totalSheets),
    authorizedOfficial: payload.authorizedOfficial,
    headOfAccounting: payload.headOfAccounting,
    headOfTreasury: payload.headOfTreasury,
    localChiefExecutive: payload.localChiefExecutive,
    disbursingOfficer: payload.disbursingOfficer,
    cafaoNo: payload.cafaoNo || null,
    cafaoDate: payload.cafaoDate || null,
  };
}

function _entryValues(payrollId: string, entries: PayrollEntryPayload[]): Array<typeof payrollEntries.$inferInsert> {
  return entries.map((entry, index) => ({
    payrollId,
    serialNo: index + 1,
    signatureNo: index + 1,
    name: entry.name,
    position: entry.position,
    idNo: entry.idNo || null,
    amount: _formatAmount(entry.amount),
  }));
}

/**
 * Fetches all monthly payroll records with their line items.
 *
 * @description
 * Reads payroll parent rows and associated entries, then maps them into management-table DTOs
 * with computed total amounts. Returns an empty list when no payrolls exist.
 *
 * @async
 * @function getAll
 * @returns {Promise<Result<PayrollItem[]>>} Payroll records on success, or a failure result.
 */
export async function getAll(): Promise<Result<PayrollItem[]>> {
  try {
    const rows = await db.select().from(payrolls).orderBy(payrolls.payrollMonth, payrolls.payrollNo);
    const items: PayrollItem[] = [];

    for (const row of rows) {
      const entries = await db
        .select()
        .from(payrollEntries)
        .where(eq(payrollEntries.payrollId, row.id))
        .orderBy(payrollEntries.serialNo);
      items.push(_mapPayroll(row, entries));
    }

    return new Success(items);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to retrieve payrolls.", {}, e);
  }
}

/**
 * Fetches one monthly payroll by ID.
 *
 * @description
 * Loads a payroll parent row with all payee line items. Returns a not-found failure
 * when the ID does not match an existing payroll.
 *
 * @async
 * @function getById
 * @param {string} id - Payroll UUID.
 * @returns {Promise<Result<PayrollItem>>} Payroll on success, or a failure result.
 */
export async function getById(id: string): Promise<Result<PayrollItem>> {
  try {
    const item = await _fetchById(id);
    if (!item) {
      return new Failure(ErrorCodes.ResourceNotFound, "Payroll not found.", { id });
    }

    return new Success(item);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to retrieve payroll.", { id }, e);
  }
}

/**
 * Creates a monthly payroll with line items.
 *
 * @description
 * Validates the header and payee rows, stores the monthly payroll parent record,
 * and inserts serial-numbered employee/payee entries.
 *
 * @async
 * @function createPayroll
 * @param {PayrollPayload} payload - Payroll header, signatories, and line items.
 * @param {User} user - Authenticated user creating the payroll.
 * @returns {Promise<Result<PayrollItem>>} Created payroll on success, or a failure result.
 */
export async function createPayroll(payload: PayrollPayload, user: User): Promise<Result<PayrollItem>> {
  try {
    const validationFailure = _validatePayroll(payload);
    if (validationFailure) return validationFailure;

    const [inserted] = await db
      .insert(payrolls)
      .values({
        ..._payrollValues(payload),
        createdById: user.id,
      } as typeof payrolls.$inferInsert)
      .returning({ id: payrolls.id });

    if (!inserted) {
      return new Failure(ErrorCodes.Fatal, "Failed to insert payroll.", { payload });
    }

    await db.insert(payrollEntries).values(_entryValues(inserted.id, payload.entries));

    const created = await _fetchById(inserted.id);
    if (!created) {
      return new Failure(ErrorCodes.ResourceNotFound, "Payroll not found after creation.", { id: inserted.id });
    }

    return new Success(created);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to create payroll.", { payload, userId: user.id }, e);
  }
}

/**
 * Updates a monthly payroll and replaces its line items.
 *
 * @description
 * Validates the full payroll payload, updates the parent row, deletes old line items,
 * and inserts the submitted entries with fresh serial numbers.
 *
 * @async
 * @function updatePayroll
 * @param {string} id - Payroll UUID.
 * @param {PayrollPayload} payload - Complete payroll data.
 * @param {User} user - Authenticated user performing the update.
 * @returns {Promise<Result<PayrollItem>>} Updated payroll on success, or a failure result.
 */
export async function updatePayroll(id: string, payload: PayrollPayload, user: User): Promise<Result<PayrollItem>> {
  try {
    const existing = await _fetchById(id);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, "Payroll not found.", { id });
    }

    const validationFailure = _validatePayroll(payload);
    if (validationFailure) return validationFailure;

    await db
      .update(payrolls)
      .set(_payrollValues(payload))
      .where(eq(payrolls.id, id));

    await db.delete(payrollEntries).where(eq(payrollEntries.payrollId, id));
    await db.insert(payrollEntries).values(_entryValues(id, payload.entries));

    const updated = await _fetchById(id);
    if (!updated) {
      return new Failure(ErrorCodes.ResourceNotFound, "Payroll not found after update.", { id });
    }

    return new Success(updated);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to update payroll.", { id, payload, userId: user.id }, e);
  }
}

/**
 * Deletes a monthly payroll and its line items.
 *
 * @description
 * Removes child entries before deleting the payroll parent row. Returns a not-found
 * failure when no matching payroll exists.
 *
 * @async
 * @function deletePayroll
 * @param {string} id - Payroll UUID.
 * @returns {Promise<Result<null>>} Null on success, or a failure result.
 */
export async function deletePayroll(id: string): Promise<Result<null>> {
  try {
    await db.delete(payrollEntries).where(eq(payrollEntries.payrollId, id));
    const [deleted] = await db
      .delete(payrolls)
      .where(eq(payrolls.id, id))
      .returning({ id: payrolls.id });

    if (!deleted) {
      return new Failure(ErrorCodes.ResourceNotFound, "Payroll not found.", { id });
    }

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to delete payroll.", { id }, e);
  }
}

/**
 * Exports a monthly payroll to an Excel workbook.
 *
 * @description
 * Builds an XLSX workbook that mirrors the provided payroll sheet format: title,
 * LGU/fund/payroll metadata, payee rows, total row, and certification/signatory footer.
 *
 * @async
 * @function exportPayrollToExcelBuffer
 * @param {string} id - Payroll UUID to export.
 * @returns {Promise<Result<Buffer>>} Excel workbook bytes on success, or a failure result.
 */
export async function exportPayrollToExcelBuffer(id: string): Promise<Result<Buffer>> {
  try {
    const item = await _fetchById(id);
    if (!item) {
      return new Failure(ErrorCodes.ResourceNotFound, "Payroll not found.", { id });
    }

    const { Workbook } = await import("@cj-tech-master/excelts");
    const wb = new Workbook();
    const ws = wb.addWorksheet("Payroll", { views: [{ showGridLines: true }] });

    const thinSide = { style: "thin" as const, color: { argb: "FF000000" } };
    const mediumSide = { style: "medium" as const, color: { argb: "FF000000" } };
    const thinBorder = { top: thinSide, bottom: thinSide, left: thinSide, right: thinSide };
    const mediumBottom = { bottom: mediumSide };

    ws.columns = [
      { width: 8 },
      { width: 28 },
      { width: 22 },
      { width: 22 },
      { width: 22 },
      { width: 22 },
    ];

    const lastColumn = 6;
    const center = { horizontal: "center" as const, vertical: "middle" as const };
    const right = { horizontal: "right" as const, vertical: "middle" as const };
    const left = { horizontal: "left" as const, vertical: "middle" as const };

    ws.mergeCells(1, 1, 1, lastColumn);
    ws.getCell(1, 1).value = "PAYROLL";
    ws.getCell(1, 1).font = { name: "Arial", size: 16, bold: true };
    ws.getCell(1, 1).alignment = center;
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, lastColumn);
    ws.getCell(2, 1).value = item.purpose || "";
    ws.getCell(2, 1).font = { name: "Arial", size: 11, underline: true };
    ws.getCell(2, 1).alignment = center;

    ws.getCell(4, 1).value = "LGU";
    ws.getCell(4, 2).value = item.lgu;
    ws.getCell(4, 2).font = { name: "Arial", size: 11, bold: true, underline: true };
    ws.getCell(5, 1).value = "Fund";
    ws.getCell(5, 2).value = item.fund;
    ws.getCell(5, 2).font = { name: "Arial", size: 11, bold: true, underline: true };

    ws.getCell(4, 5).value = "Payroll No. :";
    ws.getCell(4, 5).alignment = right;
    ws.getCell(4, 6).value = item.payrollNo;
    ws.getCell(4, 6).font = { name: "Arial", size: 11, bold: true, color: { argb: "FF9A1B12" } };
    ws.getCell(4, 6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEFF2" } };
    ws.getCell(5, 5).value = "Sheet";
    ws.getCell(5, 5).alignment = right;
    ws.getCell(5, 6).value = `${item.sheetNumber} of ${item.totalSheets} Sheets`;

    try {
      const seal = await readFile(path.join(process.cwd(), "public", "assets", "tigbauan-seal.png"));
      const imageId = wb.addImage({ buffer: seal, extension: "png" });
      ws.addImage(imageId, { tl: { col: 2.8, row: 3 }, ext: { width: 52, height: 52 } });
    } catch {
      // Export remains valid if the seal asset is unavailable.
    }

    ws.mergeCells(7, 1, 7, lastColumn);
    ws.getCell(7, 1).value = "We acknowledge receipt of cash shown opposite our name as full compensation for services rendered for the period covered.";
    ws.getCell(7, 1).font = { name: "Arial", size: 11, italic: true };
    ws.getCell(7, 1).alignment = left;

    const headerRow = ws.getRow(9);
    ["Serial No.", "NAME", "POSITION", "ID NO.", "AMOUNT", "SIGNATURE OF RECEIPIENT"].forEach((label, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = label;
      cell.font = { name: "Arial", size: 11, bold: true };
      cell.alignment = center;
      cell.border = thinBorder;
    });
    headerRow.height = 20;

    let rowNumber = 10;
    for (const entry of item.entries) {
      const row = ws.getRow(rowNumber);
      row.height = 28;
      row.getCell(1).value = entry.serialNo;
      row.getCell(2).value = entry.name;
      row.getCell(3).value = entry.position;
      row.getCell(4).value = entry.idNo ?? "";
      row.getCell(5).value = Number(entry.amount);
      row.getCell(5).numFmt = "#,##0.00";
      row.getCell(6).value = entry.signatureNo;

      row.getCell(1).alignment = center;
      row.getCell(2).alignment = left;
      row.getCell(3).alignment = center;
      row.getCell(4).alignment = center;
      row.getCell(5).alignment = right;
      row.getCell(6).alignment = { horizontal: "right", vertical: "top" };

      for (let col = 1; col <= lastColumn; col++) {
        row.getCell(col).font = { name: "Arial", size: 11 };
        row.getCell(col).border = thinBorder;
      }
      rowNumber++;
    }

    const totalRow = ws.getRow(rowNumber);
    ws.mergeCells(rowNumber, 1, rowNumber, 4);
    totalRow.getCell(1).value = "Total:";
    totalRow.getCell(1).font = { name: "Arial", size: 11, bold: true };
    totalRow.getCell(1).alignment = right;
    totalRow.getCell(5).value = Number(item.totalAmount);
    totalRow.getCell(5).numFmt = "#,##0.00";
    totalRow.getCell(5).font = { name: "Arial", size: 11, bold: true };
    totalRow.getCell(5).alignment = right;
    for (let col = 1; col <= lastColumn; col++) {
      totalRow.getCell(col).border = thinBorder;
    }

    const certRow = rowNumber + 2;
    const certTexts = [
      "A. CERTIFIED:  Services duly rendered as stated.",
      "B. CERTIFIED:  Supporting documents complete and proper.",
      "C. CERTIFIED:  Cash available for the purpose.",
      `D. APPROVED FOR PAYMENT:\nPHP ${formatAmountForWords(item.totalAmount)}`,
      "CERTIFIED: Each employee whose name appears on the payroll has been paid the amount as indicated opposite his/her name",
      `F. CAFAO No.: ${item.cafaoNo ?? ""}\nDate: ${item.cafaoDate ?? ""}`,
    ];

    certTexts.forEach((text, index) => {
      const cell = ws.getCell(certRow, index + 1);
      cell.value = text;
      cell.font = { name: "Arial", size: 9 };
      cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
      cell.border = thinBorder;
    });
    ws.getRow(certRow).height = 66;

    const namesRow = certRow + 4;
    const titlesRow = certRow + 5;
    const roleRow = certRow + 6;
    const signatories = [
      [item.authorizedOfficial, "Signature over Printed Name", "Authorized Official"],
      [item.headOfAccounting, "Signature over Printed Name", "Head of Accounting Division/Unit"],
      [item.headOfTreasury, "Signature over Printed Name", "Head of Treasury Division/Unit"],
      [item.localChiefExecutive, "Signature over Printed Name", "Local Chief Executive"],
      [item.disbursingOfficer, "Signature over Printed Name", "Disbursing Officer"],
    ];

    signatories.forEach(([name, title, role], index) => {
      const col = index + 1;
      ws.getCell(namesRow, col).value = name;
      ws.getCell(namesRow, col).font = { name: "Arial", size: 9, bold: true };
      ws.getCell(namesRow, col).alignment = center;
      ws.getCell(namesRow, col).border = mediumBottom;
      ws.getCell(titlesRow, col).value = title;
      ws.getCell(titlesRow, col).font = { name: "Arial", size: 8 };
      ws.getCell(titlesRow, col).alignment = center;
      ws.getCell(roleRow, col).value = role;
      ws.getCell(roleRow, col).font = { name: "Arial", size: 8 };
      ws.getCell(roleRow, col).alignment = center;
    });

    (ws as { pageSetup: unknown }).pageSetup = {
      paperSize: 8,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 },
    };

    const rawBuffer = await wb.xlsx.writeBuffer();
    return new Success(Buffer.from(rawBuffer));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to export payroll.", { id }, e);
  }
}

function formatAmountForWords(value: string): string {
  return Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function _fetchById(id: string): Promise<PayrollItem | null> {
  const [row] = await db
    .select()
    .from(payrolls)
    .where(eq(payrolls.id, id))
    .limit(1);

  if (!row) return null;

  const entries = await db
    .select()
    .from(payrollEntries)
    .where(eq(payrollEntries.payrollId, row.id))
    .orderBy(payrollEntries.serialNo);

  return _mapPayroll(row, entries);
}
