'use client';

import {useVirtualizer} from '@tanstack/react-virtual';
import {Search} from 'lucide-react';
import React, {useCallback, useMemo, useRef, useState} from 'react';

import {
  filterSaaobStatisticTreeByQuery,
  flattenSaaobStatisticVisible,
  type SaaobStatisticFlatRow,
} from '@/common/saaob/client';
import {
  SaaobPageAggregateRow,
  SaaobPageGroupRow,
  SaaobPageSpacerRow,
  SaaobPageTableHeader,
  useSaaobColumnVisibility,
} from '@/common/saaob/page-table';
import {ColumnVisibilityPicker} from '@/components/column-visibility-picker';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableHeader} from '@/components/ui/table';
import type {
  SaaobStatisticGroupResponse,
  SaaobStatisticItemResponse,
} from '@/lib/http/client/responses';

type Props = {
  data: Array<SaaobStatisticGroupResponse | SaaobStatisticItemResponse>;
  selectedRowId?: string | null;
  onRowClick?: (row: SaaobStatisticFlatRow) => void;
  onRowDoubleClick?: (row: SaaobStatisticFlatRow) => void;
};

export default function SaaobReadOnlyStatistics({
  data,
  selectedRowId,
  onRowClick,
  onRowDoubleClick,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const columnVisibility = useSaaobColumnVisibility('statistics');

  const filteredTree = useMemo(
    () => filterSaaobStatisticTreeByQuery(data, searchQuery),
    [data, searchQuery],
  );

  const flatRows = useMemo(
    () => flattenSaaobStatisticVisible(filteredTree, collapsed, 0, searchQuery.trim().length > 0),
    [filteredTree, collapsed, searchQuery],
  );

  // eslint-disable-next-line
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 40,
    overscan: 15,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-56 text-xs"
            placeholder="Search statistics data..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="ml-auto">
          <ColumnVisibilityPicker
            groups={columnVisibility.pickerGroups}
            selected={columnVisibility.visibleKeys}
            selectedToggleableCount={columnVisibility.selectedToggleableCount}
            totalToggleableCount={columnVisibility.totalToggleableCount}
            onToggle={columnVisibility.toggle}
            onSelectAll={columnVisibility.selectAll}
            onDeselectAll={columnVisibility.deselectAll}
          />
        </div>
      </div>

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No results match your search.' : 'No statistics records found.'}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[500px] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <SaaobPageTableHeader visibleColumns={columnVisibility.orderedVisible} />
              </TableHeader>

              <TableBody>
                {paddingTop > 0 && (
                  <SaaobPageSpacerRow
                    visibleCount={columnVisibility.visibleCount}
                    height={paddingTop}
                  />
                )}

                {virtualRows.map((virtualRow) => {
                  const row = flatRows[virtualRow.index] as SaaobStatisticFlatRow;

                  if (row.kind === 'group') {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    return (
                      <SaaobPageGroupRow
                        key={row.id}
                        visibleColumns={columnVisibility.orderedVisible}
                        visibleCount={columnVisibility.visibleCount}
                        name={row.data.name}
                        depth={row.depth}
                        isCollapsed={isCollapsed}
                        isSelected={selectedRowId === row.id}
                        selectedClassName="ring-1 ring-primary"
                        rowClassName="bg-muted/50 select-none"
                        onToggleCollapse={() => toggleCollapse(row.id)}
                        onClick={() => onRowClick?.(row)}
                        onDoubleClick={() => onRowDoubleClick?.(row)}
                        measureRef={rowVirtualizer.measureElement}
                        dataIndex={virtualRow.index}
                      />
                    );
                  }

                  const item = row.data;
                  return (
                    <SaaobPageAggregateRow
                      key={row.id}
                      visibleColumns={columnVisibility.orderedVisible}
                      data={item}
                      name={item.name}
                      depth={row.depth}
                      isSelected={selectedRowId === row.id}
                      blankAccountAndRemarks
                      rowClassName={virtualRow.index % 2 === 1 ? 'bg-muted hover:bg-muted/50' : ''}
                      measureRef={rowVirtualizer.measureElement}
                      dataIndex={virtualRow.index}
                      onClick={() => onRowClick?.(row)}
                      onDoubleClick={() => onRowDoubleClick?.(row)}
                    />
                  );
                })}

                {paddingBottom > 0 && (
                  <SaaobPageSpacerRow
                    visibleCount={columnVisibility.visibleCount}
                    height={paddingBottom}
                  />
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
