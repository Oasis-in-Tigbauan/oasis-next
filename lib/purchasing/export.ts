import { Buffer } from "buffer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { modeOfProcurements, office, purchasing, purchasingAip, user, officePosition } from "@/lib/db/schema";
import { Failure, Success } from "@/lib/one-of";
import { ErrorCodes, Result } from "@/lib/one-of";

type ExportPurchaseOptions = {
  id: string;
};

type ExportItem = {
  id: number;
  unit: string;
  description: string;
  quantity: number | "";
  unitCost: number | "";
};

type ExportSignatory = {
  name: string;
  title: string;
};

type ExcelWorkbookWithImages = {
  addImage: (image: { buffer: Buffer; extension: "png" }) => number;
};

type ExcelWorksheetWithImages = {
  addImage: (
    imageId: number,
    range: {
      tl: { col: number; row: number };
      ext: { width: number; height: number };
    },
  ) => void;
};

async function addTigbauanSeal(
  workbook: ExcelWorkbookWithImages,
  worksheet: ExcelWorksheetWithImages,
  col: number,
  row: number,
  size = 64,
): Promise<void> {
  try {
    const seal = await readFile(path.join(process.cwd(), "public", "assets", "tigbauan-seal.png"));
    const imageId = workbook.addImage({ buffer: seal, extension: "png" });
    worksheet.addImage(imageId, {
      tl: { col, row },
      ext: { width: size, height: size },
    });
  } catch {
    // Keep exports available if the optional seal asset is missing in an environment.
  }
}

function formatFundType(value: Optional<string>): string {
  return value?.replace(/\s+\d[\d.-]*$/u, "").trim() ?? "";
}

export async function exportPurchaseRequestToBuffer(
  options: ExportPurchaseOptions,
): Promise<Result<Buffer>> {
  try {
    const { Workbook } = await import("@cj-tech-master/excelts");

    const [sourceItem] = await db
      .select({
        prNumber: purchasing.prNumber,
        requestingOfficeId: purchasing.requestingOfficeId,
      })
      .from(purchasing)
      .where(eq(purchasing.id, options.id))
      .limit(1);

    if (!sourceItem) {
      return new Failure(ErrorCodes.ResourceNotFound, "Purchase request item not found.");
    }

    const allIds = await db
      .select({ id: purchasing.id })
      .from(purchasing)
      .where(eq(purchasing.prNumber, sourceItem.prNumber))
      .orderBy(purchasing.createdAt);

    if (allIds.length === 0) {
      return new Failure(ErrorCodes.ResourceNotFound, "No purchase request items found.");
    }

    const ids = allIds.map(r => r.id);

    const rows = await db
      .select()
      .from(purchasing)
      .where(inArray(purchasing.id, ids));

    const aipRows = await db
      .select()
      .from(purchasingAip)
      .where(inArray(purchasingAip.purchasingId, ids));

    const [officeRow] = await db
      .select({ name: office.name })
      .from(office)
      .where(eq(office.id, sourceItem.requestingOfficeId))
      .limit(1);

    const userIds = Array.from(new Set(
      rows.flatMap(r => [r.requestingUserId, r.treasurerId, r.approverId, r.headOfOfficeId]),
    ));

    const userRows = userIds.length > 0
      ? await db
        .select({
          id: user.id,
          name: user.name,
          position: officePosition.name,
        })
        .from(user)
        .leftJoin(officePosition, eq(user.officePositionId, officePosition.id))
        .where(inArray(user.id, userIds))
      : [];

    const userMap = new Map(userRows.map(u => [u.id, u]));

    const aipMap = new Map<string, Array<{
      aipCode: string;
      ppa: string;
      sourceOfFund: string | null;
      amountCharged: string | null;
    }>>();
    for (const ar of aipRows) {
      if (!aipMap.has(ar.purchasingId)) {
        aipMap.set(ar.purchasingId, []);
      }
      aipMap.get(ar.purchasingId)!.push({
        aipCode: ar.aipCode,
        ppa: ar.ppa,
        sourceOfFund: ar.sourceOfFund,
        amountCharged: ar.amountCharged,
      });
    }

    const first = rows[0];
    const firstAip = aipMap.get(first.id) ?? [];
    const aipCode = firstAip[0]?.aipCode ?? "";
    const ppa = firstAip[0]?.ppa ?? "";

    const resolveSignatory = (userId: string): ExportSignatory => {
      const u = userMap.get(userId);
      return { name: u?.name ?? "Unknown", title: u?.position ?? "" };
    };

    const requestedBy = resolveSignatory(first.headOfOfficeId);
    const cashAvailable = resolveSignatory(first.treasurerId);
    const approvedByUser = resolveSignatory(first.approverId);

    const items: ExportItem[] = rows.map((row, idx) => ({
      id: idx + 1,
      unit: row.unit,
      description: row.itemDescription,
      quantity: row.quantity === null ? "" : Number(row.quantity),
      unitCost: row.unitCost === null ? "" : Number(row.unitCost),
    }));

    const wb = new Workbook();
    const ws = wb.addWorksheet("Purchase Request", { views: [{ showGridLines: true }] });

    ws.columns = [
      { width: 10 },
      { width: 12 },
      { width: 42 },
      { width: 12 },
      { width: 14 },
      { width: 16 },
    ];

    const thinSide = { style: "thin" as const, color: { argb: "000000" } };
    const thinBorder = { top: thinSide, bottom: thinSide, left: thinSide, right: thinSide };

    const applyBorders = (startRow: number, endRow: number, startCol: number, endCol: number) => {
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          ws.getCell(r, c).border = thinBorder;
        }
      }
    };

    ws.mergeCells("A2:F2");
    const titleCell = ws.getCell("A2");
    titleCell.value = "PURCHASE REQUEST";
    titleCell.font = { name: "Arial", size: 18, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(2).height = 32;
    await addTigbauanSeal(wb, ws, 5.1, 0.45, 48);

    ws.getCell("A4").value = "LGU:   MUNICIPAL GOVERNMENT OF TIGBAUAN";
    ws.getCell("A4").font = { name: "Arial", size: 11, bold: true };

    ws.getCell("E4").value = "Fund:";
    ws.getCell("E4").font = { name: "Arial", size: 11 };
    ws.getCell("E4").alignment = { horizontal: "right" };
    ws.getCell("F4").value = formatFundType(firstAip[0]?.sourceOfFund);
    ws.getCell("F4").font = { name: "Arial", size: 11, bold: true, underline: true };

    applyBorders(5, 6, 1, 3);
    applyBorders(5, 6, 4, 5);
    applyBorders(5, 6, 6, 6);

    ws.mergeCells("A5:C5");
    ws.getCell("A5").value = `Department:  ${officeRow?.name ?? ""}`;
    ws.getCell("A5").font = { name: "Arial", size: 10 };

    ws.mergeCells("A6:C6");
    ws.getCell("A6").value = `Section:       ${""}`;
    ws.getCell("A6").font = { name: "Arial", size: 10 };

    ws.getCell("D5").value = "PR No.";
    ws.getCell("D5").font = { name: "Arial", size: 10 };
    ws.getCell("E5").value = first.prNumber ?? "";
    ws.getCell("E5").font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFF0000" } };

    ws.mergeCells("D6:E6");
    ws.getCell("D6").value = `FPP: ${""}`;
    ws.getCell("D6").font = { name: "Arial", size: 10 };

    ws.getCell("F5").value = "Date:";
    ws.getCell("F5").font = { name: "Arial", size: 10 };

    const headers = ["Item No.", "Unit", "Item Description", "Quantity", "Unit Cost", "Total Cost"];
    const headerRow = ws.getRow(8);
    headerRow.height = 22;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: "Arial", size: 10, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      cell.border = thinBorder;
    });

    let currentLine = 9;
    let grandTotal = 0;
    for (const item of items) {
      const row = ws.getRow(currentLine);
      row.height = 20;
      row.getCell(1).value = item.id;
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).value = item.unit;
      row.getCell(2).alignment = { horizontal: "center" };
      row.getCell(3).value = item.description;
      row.getCell(3).alignment = { horizontal: "left" };
      row.getCell(4).value = item.quantity;
      row.getCell(4).alignment = { horizontal: "center" };
      row.getCell(5).value = item.unitCost;
      row.getCell(5).numFmt = "#,##0.00";
      row.getCell(5).alignment = { horizontal: "right" };
      if (typeof item.quantity === "number" && typeof item.unitCost === "number") {
        const itemTotal = item.quantity * item.unitCost;
        grandTotal += itemTotal;
        row.getCell(6).value = { formula: `D${currentLine}*E${currentLine}`, result: itemTotal };
      } else {
        row.getCell(6).value = "-";
      }
      row.getCell(6).numFmt = "#,##0.00";
      row.getCell(6).alignment = { horizontal: "right" };
      for (let c = 1; c <= 6; c++) {
        row.getCell(c).border = thinBorder;
        row.getCell(c).font = { name: "Arial", size: 10 };
      }
      currentLine++;
    }

    const totalRow = ws.getRow(currentLine);
    ws.mergeCells(`A${currentLine}:E${currentLine}`);
    totalRow.getCell(1).value = "TOTAL-------";
    totalRow.getCell(1).font = { name: "Arial", size: 10, bold: true };
    totalRow.getCell(1).alignment = { horizontal: "right" };
    totalRow.getCell(6).value = { formula: `SUM(F9:F${currentLine - 1})`, result: grandTotal };
    totalRow.getCell(6).font = { name: "Arial", size: 10, bold: true };
    totalRow.getCell(6).numFmt = "#,##0.00";
    totalRow.getCell(6).alignment = { horizontal: "right" };
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    ws.mergeCells(`A${currentLine}:A${currentLine + 2}`);
    ws.getCell(`A${currentLine}`).value = "Purpose:";
    ws.getCell(`A${currentLine}`).font = { name: "Arial", size: 10 };
    ws.getCell(`A${currentLine}`).alignment = { vertical: "top" };
    ws.mergeCells(`B${currentLine}:F${currentLine + 2}`);
    ws.getCell(`B${currentLine}`).value = first.purpose ?? "";
    ws.getCell(`B${currentLine}`).font = { name: "Arial", size: 10 };
    ws.getCell(`B${currentLine}`).alignment = { vertical: "top", wrapText: true };
    applyBorders(currentLine, currentLine + 2, 1, 6);
    currentLine += 3;

    ws.getCell(`A${currentLine}`).value = "AIP/PPA:";
    ws.getCell(`A${currentLine}`).font = { name: "Arial", size: 10 };
    ws.mergeCells(`B${currentLine}:F${currentLine}`);
    ws.getCell(`B${currentLine}`).value = `${ppa}          ${aipCode}`;
    ws.getCell(`B${currentLine}`).font = { name: "Arial", size: 9 };
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    ws.getCell(`A${currentLine}`).value = "Charges:";
    ws.getCell(`A${currentLine}`).font = { name: "Arial", size: 10 };
    ws.mergeCells(`B${currentLine}:F${currentLine + 1}`);
    ws.getCell(`B${currentLine}`).value = `${firstAip[0]?.sourceOfFund ?? ""}\n${aipCode}`;
    ws.getCell(`B${currentLine}`).font = { name: "Arial", size: 9 };
    ws.getCell(`B${currentLine}`).alignment = { wrapText: true, vertical: "top" };
    applyBorders(currentLine, currentLine + 1, 1, 6);
    currentLine += 2;

    ws.mergeCells(`A${currentLine}:B${currentLine}`);
    ws.getCell(`A${currentLine}`).value = "Requested by:";
    ws.mergeCells(`C${currentLine}:D${currentLine}`);
    ws.getCell(`C${currentLine}`).value = "Cash Availability:";
    ws.mergeCells(`E${currentLine}:F${currentLine}`);
    ws.getCell(`E${currentLine}`).value = "Approved by:";
    for (let col = 1; col <= 6; col++) {
      ws.getCell(currentLine, col).font = { name: "Arial", size: 10, bold: true };
      ws.getCell(currentLine, col).border = {
        top: thinSide,
        left: col === 1 || col === 3 || col === 5 ? thinSide : undefined,
        right: col === 2 || col === 4 || col === 6 ? thinSide : undefined,
      };
    }
    currentLine++;

    ws.getRow(currentLine).height = 35;
    for (let col = 1; col <= 6; col++) {
      ws.getCell(currentLine, col).border = {
        left: col === 1 || col === 3 || col === 5 ? thinSide : undefined,
        right: col === 2 || col === 4 || col === 6 ? thinSide : undefined,
      };
    }
    currentLine++;

    ws.mergeCells(`A${currentLine}:B${currentLine}`);
    ws.getCell(`A${currentLine}`).value = requestedBy.name;
    ws.mergeCells(`C${currentLine}:D${currentLine}`);
    ws.getCell(`C${currentLine}`).value = cashAvailable.name;
    ws.mergeCells(`E${currentLine}:F${currentLine}`);
    ws.getCell(`E${currentLine}`).value = approvedByUser.name;
    for (let col = 1; col <= 6; col++) {
      ws.getCell(currentLine, col).font = { name: "Arial", size: 10, bold: true };
      ws.getCell(currentLine, col).alignment = { horizontal: "center" };
      ws.getCell(currentLine, col).border = {
        left: col === 1 || col === 3 || col === 5 ? thinSide : undefined,
        right: col === 2 || col === 4 || col === 6 ? thinSide : undefined,
      };
    }
    currentLine++;

    ws.getRow(currentLine).height = 32;
    ws.mergeCells(`A${currentLine}:B${currentLine}`);
    ws.getCell(`A${currentLine}`).value = requestedBy.title;
    ws.mergeCells(`C${currentLine}:D${currentLine}`);
    ws.getCell(`C${currentLine}`).value = cashAvailable.title;
    ws.mergeCells(`E${currentLine}:F${currentLine}`);
    ws.getCell(`E${currentLine}`).value = approvedByUser.title;
    for (let col = 1; col <= 6; col++) {
      ws.getCell(currentLine, col).font = { name: "Arial", size: 9 };
      ws.getCell(currentLine, col).alignment = { horizontal: "center", wrapText: true, vertical: "middle" };
      ws.getCell(currentLine, col).border = {
        bottom: thinSide,
        left: col === 1 || col === 3 || col === 5 ? thinSide : undefined,
        right: col === 2 || col === 4 || col === 6 ? thinSide : undefined,
      };
    }

    const rawBuffer = await wb.xlsx.writeBuffer();
    if (rawBuffer instanceof Buffer) return new Success(rawBuffer);
    return new Success(Buffer.from(rawBuffer as unknown as Uint8Array));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to export purchase request.", {}, e as Error);
  }
}

/**
 * Converts a numeric amount to words (Philippine Peso format).
 * @example numberToWords(1050) // "ONE THOUSAND AND FIFTY PESOS ONLY"
 */
function numberToWords(n: number): string {
  const ones = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
    "SEVENTEEN", "EIGHTEEN", "NINETEEN",
  ];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  const convertBelow1000 = (num: number): string => {
    if (num === 0) return "";
    const h = Math.floor(num / 100);
    const r = num % 100;
    let s = "";
    if (h > 0) {
      s += ones[h] + " HUNDRED";
      if (r > 0) s += " ";
    }
    if (r > 0) {
      s += r < 20 ? ones[r] : tens[Math.floor(r / 10)] + (r % 10 > 0 ? " " + ones[r % 10] : "");
    }
    return s;
  };

  if (n === 0) return "ZERO PESOS ONLY";

  const whole = Math.floor(n);
  const cents = Math.round((n - whole) * 100);

  const parts: string[] = [];
  const units = [
    [1000000000, "BILLION"],
    [1000000, "MILLION"],
    [1000, "THOUSAND"],
  ] as const;
  let remainder = whole;
  for (const [divisor, label] of units) {
    const q = Math.floor(remainder / divisor);
    if (q > 0) {
      parts.push(convertBelow1000(q) + " " + label);
    }
    remainder %= divisor;
  }
  if (remainder > 0) {
    parts.push(convertBelow1000(remainder));
  }

  let result = parts.join(" ").trim() + " PESOS";
  if (cents > 0) {
    result += " AND " + convertBelow1000(cents) + " CENTAVOS";
  }
  result += " ONLY";
  return result;
}

export async function exportPurchaseOrderToBuffer(
  options: ExportPurchaseOptions,
): Promise<Result<Buffer>> {
  try {
    const { Workbook } = await import("@cj-tech-master/excelts");

    const [sourceItem] = await db
      .select({
        purchaseOrderNumber: purchasing.purchaseOrderNumber,
        requestingOfficeId: purchasing.requestingOfficeId,
      })
      .from(purchasing)
      .where(eq(purchasing.id, options.id))
      .limit(1);

    if (!sourceItem) {
      return new Failure(ErrorCodes.ResourceNotFound, "Purchase order item not found.");
    }

    if (!sourceItem.purchaseOrderNumber) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        "Purchase order has not been created for this item.",
      );
    }

    const allIds = await db
      .select({ id: purchasing.id })
      .from(purchasing)
      .where(eq(purchasing.purchaseOrderNumber, sourceItem.purchaseOrderNumber))
      .orderBy(purchasing.createdAt);

    if (allIds.length === 0) {
      return new Failure(ErrorCodes.ResourceNotFound, "No purchase order items found.");
    }

    const ids = allIds.map(r => r.id);

    const rows = await db
      .select()
      .from(purchasing)
      .where(inArray(purchasing.id, ids));

    const first = rows[0];
    const prNumbers = Array.from(new Set(rows.map(row => row.prNumber))).join(", ");

    const items: ExportItem[] = rows.map((row, idx) => ({
      id: idx + 1,
      unit: row.unit,
      description: row.itemDescription,
      quantity: row.quantity === null ? "" : Number(row.quantity),
      unitCost: row.unitCost === null ? "" : Number(row.unitCost),
    }));

    let modeOfProcurement = "";
    if (first.procurementId) {
      const [procRow] = await db
        .select({ name: modeOfProcurements.name })
        .from(modeOfProcurements)
        .where(eq(modeOfProcurements.id, first.procurementId))
        .limit(1);
      modeOfProcurement = procRow?.name ?? "";
    }

    const wb = new Workbook();
    const ws = wb.addWorksheet("Purchase Order", { views: [{ showGridLines: true }] });

    ws.columns = [
      { width: 10 },
      { width: 12 },
      { width: 42 },
      { width: 12 },
      { width: 14 },
      { width: 16 },
    ];

    const thinSide = { style: "thin" as const, color: { argb: "000000" } };
    const thinBorder = { top: thinSide, bottom: thinSide, left: thinSide, right: thinSide };

    const applyBorders = (startRow: number, endRow: number, startCol: number, endCol: number) => {
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          ws.getCell(r, c).border = thinBorder;
        }
      }
    };

    const formatDate = (d: Date | null | undefined): string =>
      d
        ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
        : "";

    // ── Title section ──────────────────────────────────────────────────────
    ws.mergeCells("A2:F2");
    const titleCell = ws.getCell("A2");
    titleCell.value = "PURCHASE ORDER";
    titleCell.font = { name: "Arial", size: 18, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(2).height = 32;

    ws.mergeCells("A3:F3");
    const subCell = ws.getCell("A3");
    subCell.value = "Municipal Government of Tigbauan";
    subCell.font = { name: "Arial", size: 13, bold: true };
    subCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(3).height = 24;

    ws.mergeCells("A4:F4");
    const lguCell = ws.getCell("A4");
    lguCell.value = "LGU";
    lguCell.font = { name: "Arial", size: 11, bold: true };
    lguCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(4).height = 20;
    await addTigbauanSeal(wb, ws, 0.9, 1.05, 64);

    // ── Separator ──────────────────────────────────────────────────────────
    applyBorders(5, 5, 1, 6);

    // ── Supplier / PO details (rows 6-8) ───────────────────────────────────
    const poDateStr = formatDate(first.createdAt);

    type FieldRow = { label: string; value: string; bold?: boolean; red?: boolean };
    const leftFields: FieldRow[] = [
      { label: "Supplier:", value: first.supplier ?? "" },
      { label: "Address:", value: first.address ?? "" },
      { label: "TIN:", value: first.tinNumber ?? "" },
      { label: "", value: "" },
    ];
    const rightFields: FieldRow[] = [
      { label: "PO No.:", value: first.purchaseOrderNumber ?? "", bold: true, red: true },
      { label: "Date:", value: poDateStr },
      { label: "Mode of Procurement:", value: modeOfProcurement },
      { label: "PR No./s:", value: prNumbers, bold: true, red: true },
    ];

    for (let i = 0; i < 4; i++) {
      const r = 6 + i;
      applyBorders(r, r, 1, 6);

      // Left side: label in col A, value merged B:C
      ws.getCell(r, 1).value = leftFields[i].label;
      ws.getCell(r, 1).font = { name: "Arial", size: 10, bold: true };
      ws.mergeCells(`B${r}:C${r}`);
      ws.getCell(r, 2).value = leftFields[i].value;
      ws.getCell(r, 2).font = { name: "Arial", size: 10 };

      // Right side: label in col D, value merged E:F
      ws.getCell(r, 4).value = rightFields[i].label;
      ws.getCell(r, 4).font = { name: "Arial", size: 10, bold: true };
      ws.mergeCells(`E${r}:F${r}`);
      ws.getCell(r, 5).value = rightFields[i].value;
      ws.getCell(r, 5).font = {
        name: "Arial",
        size: 10,
        bold: i === 0 || i === 3,
        color: i === 0 || i === 3 ? { argb: "FFFF0000" } : undefined,
      };
    }

    // ── Separator ──────────────────────────────────────────────────────────
    applyBorders(10, 10, 1, 6);

    // ── Salutation ─────────────────────────────────────────────────────────
    ws.mergeCells("A11:F11");
    ws.getCell("A11").value = "Gentlemen:";
    ws.getCell("A11").font = { name: "Arial", size: 10 };
    ws.getRow(11).height = 18;

    ws.mergeCells("A12:F12");
    ws.getCell("A12").value =
      "    Please furnish this Office the following articles subject to the terms and conditions contained herein:";
    ws.getCell("A12").font = { name: "Arial", size: 10 };
    ws.getRow(12).height = 18;

    // ── Separator ──────────────────────────────────────────────────────────
    applyBorders(13, 13, 1, 6);

    // ── Delivery details (rows 14-15) ──────────────────────────────────────
    const deliveryDateStr = formatDate(first.dateOfDelivery);

    const deliveryLeft: FieldRow[] = [
      { label: "Place of Delivery:", value: first.placeOfDelivery ?? "" },
      { label: "Date of Delivery:", value: deliveryDateStr },
    ];
    const deliveryRight: FieldRow[] = [
      { label: "Delivery Term:", value: first.deliveryTerm ?? "" },
      { label: "Payment Term:", value: first.paymentTerm ?? "" },
    ];

    for (let i = 0; i < 2; i++) {
      const r = 14 + i;
      applyBorders(r, r, 1, 6);

      ws.getCell(r, 1).value = deliveryLeft[i].label;
      ws.getCell(r, 1).font = { name: "Arial", size: 10, bold: true };
      ws.mergeCells(`B${r}:C${r}`);
      ws.getCell(r, 2).value = deliveryLeft[i].value;
      ws.getCell(r, 2).font = { name: "Arial", size: 10 };

      ws.getCell(r, 4).value = deliveryRight[i].label;
      ws.getCell(r, 4).font = { name: "Arial", size: 10, bold: true };
      ws.mergeCells(`E${r}:F${r}`);
      ws.getCell(r, 5).value = deliveryRight[i].value;
      ws.getCell(r, 5).font = { name: "Arial", size: 10 };
    }

    // ── Separator ──────────────────────────────────────────────────────────
    applyBorders(16, 16, 1, 6);

    // ── Table header ───────────────────────────────────────────────────────
    const headers = ["Item No.", "Unit", "Item Description", "Quantity", "Unit Cost", "Total Cost"];
    const headerRow = ws.getRow(17);
    headerRow.height = 22;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: "Arial", size: 10, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      cell.border = thinBorder;
    });

    // ── Separator below header ─────────────────────────────────────────────
    applyBorders(18, 18, 1, 6);

    // ── Item rows ──────────────────────────────────────────────────────────
    let currentLine = 19;
    let grandTotal = 0;
    for (const item of items) {
      const row = ws.getRow(currentLine);
      row.height = 20;
      row.getCell(1).value = item.id;
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).value = item.unit;
      row.getCell(2).alignment = { horizontal: "center" };
      row.getCell(3).value = item.description;
      row.getCell(3).alignment = { horizontal: "left" };
      row.getCell(4).value = item.quantity;
      row.getCell(4).alignment = { horizontal: "center" };
      row.getCell(5).value = item.unitCost;
      row.getCell(5).numFmt = "#,##0.00";
      row.getCell(5).alignment = { horizontal: "right" };
      if (typeof item.quantity === "number" && typeof item.unitCost === "number") {
        const itemTotal = item.quantity * item.unitCost;
        grandTotal += itemTotal;
        row.getCell(6).value = { formula: `D${currentLine}*E${currentLine}`, result: itemTotal };
      } else {
        row.getCell(6).value = "-";
      }
      row.getCell(6).numFmt = "#,##0.00";
      row.getCell(6).alignment = { horizontal: "right" };
      for (let c = 1; c <= 6; c++) {
        row.getCell(c).border = thinBorder;
        row.getCell(c).font = { name: "Arial", size: 10 };
      }
      currentLine++;
    }

    // ── Separator after items ──────────────────────────────────────────────
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    // ── SUB-TOTAL row ─────────────────────────────────────────────────────
    ws.mergeCells(`A${currentLine}:E${currentLine}`);
    ws.getCell(currentLine, 1).value = "SUB-TOTAL";
    ws.getCell(currentLine, 1).font = { name: "Arial", size: 10, bold: true };
    ws.getCell(currentLine, 1).alignment = { horizontal: "right" };
    ws.getCell(currentLine, 6).value = grandTotal;
    ws.getCell(currentLine, 6).numFmt = "#,##0.00";
    ws.getCell(currentLine, 6).font = { name: "Arial", size: 10, bold: true };
    ws.getCell(currentLine, 6).alignment = { horizontal: "right" };
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    // ── Amount in words row ────────────────────────────────────────────────
    ws.mergeCells(`A${currentLine}:D${currentLine}`);
    ws.getCell(currentLine, 1).value = "(TOTAL AMOUNT IN WORDS)";
    ws.getCell(currentLine, 1).font = { name: "Arial", size: 10 };
    ws.getCell(currentLine, 1).alignment = { horizontal: "center" };
    ws.mergeCells(`E${currentLine}:F${currentLine}`);
    ws.getCell(currentLine, 5).value = numberToWords(grandTotal);
    ws.getCell(currentLine, 5).font = { name: "Arial", size: 10, bold: true };
    ws.getCell(currentLine, 5).alignment = { horizontal: "center" };
    applyBorders(currentLine, currentLine, 1, 6);
    currentLine++;

    // ── Closing separator ──────────────────────────────────────────────────
    applyBorders(currentLine, currentLine, 1, 6);

    const rawBuffer = await wb.xlsx.writeBuffer();
    if (rawBuffer instanceof Buffer) return new Success(rawBuffer);
    return new Success(Buffer.from(rawBuffer as unknown as Uint8Array));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, "Failed to export purchase order.", {}, e as Error);
  }
}
