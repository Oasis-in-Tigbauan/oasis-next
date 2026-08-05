'use client';

import {ChevronDown, ChevronRight} from 'lucide-react';

import {
  AIP_PAGE_COLUMN_GROUPS,
  AIP_PAGE_COLUMNS,
  AIP_PAGE_STORAGE_KEY,
  buildAipPageHeaderLayout,
  getAipPageCellValue,
  type AipPageCellContext,
  type AipPageColumnDef,
} from '@/common/aip/page-columns';
import {useColumnVisibility} from '@/common/column-visibility';
import {Checkbox} from '@/components/ui/checkbox';
import {TableCell, TableHead, TableRow} from '@/components/ui/table';

export function useAipColumnVisibility() {
  return useColumnVisibility(AIP_PAGE_STORAGE_KEY, AIP_PAGE_COLUMNS, AIP_PAGE_COLUMN_GROUPS);
}

export function AipPageTableHeader({columns}: {columns: AipPageColumnDef[]}) {
  const {row1, row2} = buildAipPageHeaderLayout(columns);

  return (
    <>
      <TableRow>
        {columns.map((col, i) => (
          <TableHead
            key={`h1-${col.key}`}
            rowSpan={row2[i] ? undefined : 2}
            className={`${col.headerClassName ?? ''} ${col.key === 'select' ? 'min-w-8 border-l' : ''}`}
          >
            {row2[i] ? row1[i] : row1[i] || col.label}
          </TableHead>
        ))}
      </TableRow>
      <TableRow>
        {columns.map((col, i) =>
          row2[i] ? (
            <TableHead key={`h2-${col.key}`} className={col.headerClassName}>
              {row2[i]}
            </TableHead>
          ) : null,
        )}
      </TableRow>
    </>
  );
}

export function AipPageTableCells({
  columns,
  ctx,
}: {
  columns: AipPageColumnDef[];
  ctx: AipPageCellContext;
}) {
  return (
    <>
      {columns.map((col) => {
        if (col.key === 'select') {
          return (
            <TableCell key={col.key}>
              <Checkbox
                checked={ctx.isChecked}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={(checked) => ctx.toggleChecked(ctx.node.id, checked === true)}
                aria-label={`Select ${ctx.node.type}`}
              />
            </TableCell>
          );
        }

        if (col.key === 'aipReferenceCode') {
          return (
            <TableCell key={col.key}>
              <div className="flex items-center gap-2" style={{paddingLeft: `${ctx.depth * 16}px`}}>
                {ctx.isGroup ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      ctx.toggleExpanded(ctx.node.id);
                    }}
                    aria-label={ctx.isExpanded ? 'Collapse group' : 'Expand group'}
                  >
                    {ctx.isExpanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </button>
                ) : (
                  <span className="inline-block size-4" />
                )}
                <span className="whitespace-normal wrap-break-word">
                  {ctx.node.aipReferenceCode}
                </span>
              </div>
            </TableCell>
          );
        }

        return (
          <TableCell key={col.key} className={col.cellClassName}>
            {getAipPageCellValue(col.key, ctx)}
          </TableCell>
        );
      })}
    </>
  );
}

export function AipPageSpacerRow({colCount, height}: {colCount: number; height: number}) {
  return (
    <TableRow>
      <TableCell colSpan={colCount} style={{height: `${height}px`}} />
    </TableRow>
  );
}
