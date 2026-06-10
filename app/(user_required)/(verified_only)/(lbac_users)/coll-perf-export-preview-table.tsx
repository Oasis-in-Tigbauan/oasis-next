"use client";

import { useMemo } from "react";

import {
  buildCollPerfHeaderLayout,
  COLL_PERF_GROUP_DEPTH_CHILD_COLOR,
  COLL_PERF_GROUP_DEPTH_ROOT_COLOR,
  COLL_PERF_HEADER_COLOR,
  collPerfTotalRowColor,
  flattenCollPerfForExport,
  formatCollPerfCellForPreview,
  getCollPerfCellValue,
  quarterEndingLabel,
  resolveCollPerfExportColumns,
  type CollPerfExportColumnKey,
} from "@/common/lbac/client";
import type { CollPerfGroupResponse } from "@/lib/http/client/responses";

import Typography from "@/components/typography";

const PREVIEW_LIMIT = 120;
const INDENT_BASE_PX = 12;
const INDENT_PER_DEPTH_PX = 20;

function CollPerfHeaderRows({
  row1,
  row2,
  row3,
  colCount,
}: {
  row1: string[];
  row2: string[];
  row3: string[];
  colCount: number;
}) {
  const headerStyle = { backgroundColor: COLL_PERF_HEADER_COLOR };
  return (
    <thead className="sticky top-0 z-10">
      <tr>
        {Array.from({ length: colCount }, (_, i) => (
          <th
            key={`h1-${i}`}
            className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap"
            style={headerStyle}
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
            style={headerStyle}
          >
            {row2[i] ?? ""}
          </th>
        ))}
      </tr>
      <tr>
        {Array.from({ length: colCount }, (_, i) => (
          <th
            key={`h3-${i}`}
            className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap"
            style={headerStyle}
          >
            {row3[i] ?? ""}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function CollPerfExportPreviewTable({
  tree,
  year,
  quarter,
  selectedColumns,
}: {
  tree: CollPerfGroupResponse[];
  year: number;
  quarter: number;
  selectedColumns: CollPerfExportColumnKey[];
}) {
  const columns = useMemo(
    () => resolveCollPerfExportColumns(selectedColumns),
    [selectedColumns],
  );
  const header = useMemo(
    () => buildCollPerfHeaderLayout(quarter, columns),
    [quarter, columns],
  );
  const flat = useMemo(() => flattenCollPerfForExport(tree), [tree]);
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
      <Typography variant="small" className="shrink-0 mb-2 text-muted-foreground italic">
        LBac Form No. 1 — QUARTERLY REPORT OF RECEIPTS — FOR THE QUARTER ENDING{" "}
        {quarterEndingLabel(year, quarter).toUpperCase()}
      </Typography>
      <div className="flex-1 overflow-auto border rounded-md min-h-0">
        <table className="w-full border-collapse min-w-max text-sm">
          <CollPerfHeaderRows
            row1={header.row1}
            row2={header.row2}
            row3={header.row3}
            colCount={columns.length}
          />
          <tbody>
            {rows.map(row => {
              if (row.kind === "group") {
                const bg = row.depth === 0
                  ? COLL_PERF_GROUP_DEPTH_ROOT_COLOR
                  : COLL_PERF_GROUP_DEPTH_CHILD_COLOR;
                return (
                  <tr key={row.id} style={{ backgroundColor: bg, color: "#fff" }}>
                    {columns.map(col => {
                      const raw = getCollPerfCellValue(row, col.key, quarter);
                      const display = col.key === "particulars" ? String(raw) : "";
                      return (
                        <td
                          key={col.key}
                          className={`border border-border px-2 py-1 ${col.key === "particulars" ? "font-semibold whitespace-normal break-words max-w-xs" : ""}`}
                          style={col.key === "particulars"
                            ? { paddingLeft: `${INDENT_BASE_PX + row.depth * INDENT_PER_DEPTH_PX}px` }
                            : undefined}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              if (row.kind === "group-total") {
                const bg = collPerfTotalRowColor(row.depth, row.isRoot);
                return (
                  <tr key={row.id} className="font-bold" style={{ backgroundColor: bg }}>
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono" : ""}`}
                        style={col.key === "particulars"
                          ? { paddingLeft: `${INDENT_BASE_PX + row.depth * INDENT_PER_DEPTH_PX}px` }
                          : undefined}
                      >
                        {formatCollPerfCellForPreview(
                          getCollPerfCellValue(row, col.key, quarter),
                          col.key,
                        )}
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
                      style={col.key === "particulars"
                        ? { paddingLeft: `${INDENT_BASE_PX + row.depth * INDENT_PER_DEPTH_PX}px` }
                        : undefined}
                    >
                      {formatCollPerfCellForPreview(
                        getCollPerfCellValue(row, col.key, quarter),
                        col.key,
                      )}
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
