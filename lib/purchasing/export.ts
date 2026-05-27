import { Buffer } from "buffer";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { office, purchasing, purchasingAip, user, officePosition } from "@/lib/db/schema";
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

    ws.getCell("A4").value = "LGU:   MUNICIPAL GOVERNMENT OF TIGBAUAN";
    ws.getCell("A4").font = { name: "Arial", size: 11, bold: true };

    ws.getCell("E4").value = "Fund:";
    ws.getCell("E4").font = { name: "Arial", size: 11 };
    ws.getCell("E4").alignment = { horizontal: "right" };
    ws.getCell("F4").value = firstAip[0]?.sourceOfFund ?? "";
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

export default exportPurchaseRequestToBuffer;
