"use client";

import { useMemo } from "react";

import {
  buildMainDataHeaderLayout,
  buildQuarterlyHeaderLayout,
  flattenLbacMainForExport,
  flattenLbacQuarterlyForExport,
  formatMainCellForPreview,
  formatQuarterlyCellForPreview,
  getMainDataCellValue,
  getQuarterlyCellValue,
  LBAC_GROUP_DEPTH_CHILD_COLOR,
  LBAC_GROUP_DEPTH_ROOT_COLOR,
  LBAC_HEADER_COLOR,
  LBAC_TOTAL_CHILD_COLOR,
  LBAC_TOTAL_ROOT_COLOR,
  resolveMainExportColumns,
  resolveQuarterlyExportColumns,
  type LbacMainExportColumnKey,
  type LbacQuarterlyExportColumnKey,
} from "@/common/lbac/export-layout";
import type {
  LbacGroupResponse,
  LbacQuarterlyGroupResponse,
} from "@/lib/http/client/responses";

import Typography from "@/components/typography";

const PREVIEW_LIMIT = 120;

/** Resolves budget year from props or export query params (UTC+8). */
export function resolveLbacExportYear(
  yearProp?: number,
  exportParams?: Record<string, string>,
): number {
  if (yearProp != null) return yearProp;
  const fromParams = exportParams?.year;
  if (fromParams) {
    const parsed = Number.parseInt(fromParams, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
}

function HeaderRows({
  row1,
  row2,
  colCount,
}: {
  row1: string[];
  row2: string[];
  colCount: number;
}) {
  return (
    <thead className="sticky top-0 z-10" style={{ backgroundColor: LBAC_HEADER_COLOR }}>
      <tr>
        {Array.from({ length: colCount }, (_, i) => (
          <th
            key={`h1-${i}`}
            className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap"
            style={{ backgroundColor: LBAC_HEADER_COLOR }}
          >
            {row1[i] ?? ""}
          </th>
        ))}
      </tr>
      <tr>
        {Array.from({ length: colCount }, (_, i) => (
          <th
            key={`h2-${i}`}
            className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap"
            style={{ backgroundColor: LBAC_HEADER_COLOR }}
          >
            {row2[i] ?? ""}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function LbacMainExportPreviewTable({
  tree,
  year,
  selectedColumns,
}: {
  tree: LbacGroupResponse[];
  year: number;
  selectedColumns: LbacMainExportColumnKey[];
}) {
  const columns = useMemo(
    () => resolveMainExportColumns(selectedColumns),
    [selectedColumns],
  );
  const header = useMemo(
    () => buildMainDataHeaderLayout(year, columns),
    [year, columns],
  );
  const flat = useMemo(() => flattenLbacMainForExport(tree), [tree]);
  const rows = flat.slice(0, PREVIEW_LIMIT);
  const truncated = flat.length > PREVIEW_LIMIT;

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No data to preview.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-[10px]">
      <div className="flex-1 overflow-auto border rounded-md min-h-0">
        <table className="w-full border-collapse min-w-max text-sm">
          <HeaderRows row1={header.row1} row2={header.row2} colCount={columns.length} />
          <tbody>
            {rows.map(row => {
              if (row.kind === "group") {
                const bg = row.depth === 0 ? LBAC_GROUP_DEPTH_ROOT_COLOR : LBAC_GROUP_DEPTH_CHILD_COLOR;
                return (
                  <tr key={row.id} style={{ backgroundColor: bg, color: "#fff" }}>
                    {columns.map(col => {
                      const raw = getMainDataCellValue(row, col.key);
                      const display = col.key === "mfoPpa" ? String(raw) : "";
                      return (
                        <td
                          key={col.key}
                          className={`border border-border px-2 py-1 ${col.key === "mfoPpa" ? "font-semibold whitespace-normal break-words max-w-xs" : ""}`}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              if (row.kind === "group-total") {
                const bg = row.isRoot ? LBAC_TOTAL_ROOT_COLOR : LBAC_TOTAL_CHILD_COLOR;
                return (
                  <tr key={row.id} className="font-bold" style={{ backgroundColor: bg }}>
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono" : ""}`}
                      >
                        {formatMainCellForPreview(getMainDataCellValue(row, col.key), col.numeric)}
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <tr key={row.id} className="hover:bg-muted/30">
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono whitespace-nowrap" : "whitespace-normal break-words max-w-xs"}`}
                    >
                      {formatMainCellForPreview(getMainDataCellValue(row, col.key), col.numeric)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {truncated && (
        <Typography variant="small" className="mt-1.5 text-muted-foreground">
          Showing first {PREVIEW_LIMIT} of {flat.length} rows. The exported file contains all rows.
        </Typography>
      )}
    </div>
  );
}

export function LbacQuarterlyExportPreviewTable({
  tree,
  year,
  selectedColumns,
}: {
  tree: LbacQuarterlyGroupResponse[];
  year: number;
  selectedColumns: LbacQuarterlyExportColumnKey[];
}) {
  const columns = useMemo(
    () => resolveQuarterlyExportColumns(selectedColumns),
    [selectedColumns],
  );
  const header = useMemo(
    () => buildQuarterlyHeaderLayout(year, columns),
    [year, columns],
  );
  const flat = useMemo(() => flattenLbacQuarterlyForExport(tree), [tree]);
  const rows = flat.slice(0, PREVIEW_LIMIT);
  const truncated = flat.length > PREVIEW_LIMIT;

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No data to preview.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-[10px]">
      <div className="flex-1 overflow-auto border rounded-md min-h-0">
        <table className="w-full border-collapse min-w-max text-sm">
          <HeaderRows row1={header.row1} row2={header.row2} colCount={columns.length} />
          <tbody>
            {rows.map(row => {
              if (row.kind === "group") {
                const bg = row.depth === 0 ? LBAC_GROUP_DEPTH_ROOT_COLOR : LBAC_GROUP_DEPTH_CHILD_COLOR;
                return (
                  <tr key={row.id} style={{ backgroundColor: bg, color: "#fff" }}>
                    {columns.map(col => {
                      const raw = getQuarterlyCellValue(row, col.key);
                      const display = col.key === "mfoPpa" ? String(raw) : "";
                      return (
                        <td
                          key={col.key}
                          className={`border border-border px-2 py-1 ${col.key === "mfoPpa" ? "font-semibold whitespace-normal break-words max-w-xs" : ""}`}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              if (row.kind === "group-total") {
                const bg = row.isRoot ? LBAC_TOTAL_ROOT_COLOR : LBAC_TOTAL_CHILD_COLOR;
                return (
                  <tr key={row.id} className="font-bold" style={{ backgroundColor: bg }}>
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono" : ""}`}
                      >
                        {formatQuarterlyCellForPreview(getQuarterlyCellValue(row, col.key), col.numeric)}
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <tr key={row.id} className="hover:bg-muted/30">
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono whitespace-nowrap" : "whitespace-normal break-words max-w-xs"}`}
                    >
                      {formatQuarterlyCellForPreview(getQuarterlyCellValue(row, col.key), col.numeric)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {truncated && (
        <Typography variant="small" className="mt-1.5 text-muted-foreground">
          Showing first {PREVIEW_LIMIT} of {flat.length} rows. The exported file contains all rows.
        </Typography>
      )}
    </div>
  );
}
