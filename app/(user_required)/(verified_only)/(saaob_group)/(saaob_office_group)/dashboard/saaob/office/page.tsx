"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Download, FileSpreadsheet, Search } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  SaaobOfficeResponse,
} from "@/lib/http/client/responses";
import {
  filterSaaobTreeByQuery,
  flattenSaaobVisible,
} from "@/lib/saaob/client";
import {
  SaaobPageEntryRow,
  SaaobPageGroupRow,
  SaaobPageSpacerRow,
  SaaobPageTableHeader,
  SaaobPageTotalRow,
  useSaaobColumnVisibility,
} from "@/lib/saaob/page-table";

import { ManageTemplatesDialog } from "@/app/(user_required)/(verified_only)/(saaob_group)/manage-templates-dialog";
import { ExportDialog } from "@/app/(user_required)/(verified_only)/(saaob_group)/export-dialog";
import { ColumnVisibilityPicker } from "@/components/column-visibility-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableHeader,
} from "@/components/ui/table";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";

export default function Page() {
  const { data, error, isLoading } = useSWR<
    BetterFetchResponse<SaaobOfficeResponse, ApiResponseException>
  >("/api/saaob/office", $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const columnVisibility = useSaaobColumnVisibility("office");

  const tree = useMemo(() => data?.data?.data ?? [], [data]);
  const filteredTree = useMemo(
    () => filterSaaobTreeByQuery(tree, searchQuery),
    [tree, searchQuery],
  );

  const flatRows = useMemo(
    () => flattenSaaobVisible(filteredTree, collapsed, 0, searchQuery.trim().length > 0),
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

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-64 text-xs"
            placeholder="Search SAAOB data..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <ColumnVisibilityPicker
            groups={columnVisibility.pickerGroups}
            selected={columnVisibility.visibleKeys}
            selectedToggleableCount={columnVisibility.selectedToggleableCount}
            totalToggleableCount={columnVisibility.totalToggleableCount}
            onToggle={columnVisibility.toggle}
            onSelectAll={columnVisibility.selectAll}
            onDeselectAll={columnVisibility.deselectAll}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExportOpen(true)}
          >
            <Download className="size-3" />
            Export
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setManageTemplatesOpen(true)}
          >
            <FileSpreadsheet className="size-3" />
            Manage Headers/Footers
          </Button>
        </div>
      </div>

      <ManageTemplatesDialog
        open={manageTemplatesOpen}
        onOpenChange={setManageTemplatesOpen}
        apiPath="/api/saaob/templates/office"
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        exportApiBase="/api/saaob/export/office"
        tree={tree}
      />

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results match your search." : "No SAAOB records found for your office."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <SaaobPageTableHeader visibleColumns={columnVisibility.orderedVisible} />
              </TableHeader>

              <TableBody>
                {paddingTop > 0 && (
                  <SaaobPageSpacerRow visibleCount={columnVisibility.visibleCount} height={paddingTop} />
                )}

                {virtualRows.map(virtualRow => {
                  const row = flatRows[virtualRow.index]!;

                  if (row.kind === "group") {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    return (
                      <SaaobPageGroupRow
                        key={row.id}
                        visibleColumns={columnVisibility.orderedVisible}
                        visibleCount={columnVisibility.visibleCount}
                        name={row.data.name}
                        depth={row.depth}
                        isCollapsed={isCollapsed}
                        rowClassName="bg-muted/50 hover:bg-muted/70"
                        onToggleCollapse={() => toggleCollapse(row.id)}
                        measureRef={rowVirtualizer.measureElement}
                        dataIndex={virtualRow.index}
                      />
                    );
                  }

                  if (row.kind === "total") {
                    return (
                      <SaaobPageTotalRow
                        key={row.id}
                        visibleColumns={columnVisibility.orderedVisible}
                        data={row.data}
                        groupName={row.groupName}
                        depth={row.depth}
                        measureRef={rowVirtualizer.measureElement}
                        dataIndex={virtualRow.index}
                      />
                    );
                  }

                  const item = row.data;
                  return (
                    <SaaobPageEntryRow
                      key={row.id}
                      visibleColumns={columnVisibility.orderedVisible}
                      data={item}
                      name={item.name}
                      accountCode={item.accountCode}
                      remarks={item.other.remarks}
                      depth={row.depth}
                      rowClassName={
                        virtualRow.index % 2 === 1 ? "bg-muted hover:bg-muted/50" : undefined
                      }
                      measureRef={rowVirtualizer.measureElement}
                      dataIndex={virtualRow.index}
                    />
                  );
                })}

                {paddingBottom > 0 && (
                  <SaaobPageSpacerRow visibleCount={columnVisibility.visibleCount} height={paddingBottom} />
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
