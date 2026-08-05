'use client';

import {Columns3} from 'lucide-react';

import type {PageColumnDef, PageColumnGroup} from '@/common/column-visibility';
import Typography from '@/components/typography';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Label} from '@/components/ui/label';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';

type ColumnVisibilityPickerProps<K extends string> = {
  groups: ReadonlyArray<PageColumnGroup<K>>;
  selected: ReadonlySet<K>;
  selectedToggleableCount: number;
  totalToggleableCount: number;
  onToggle: (key: K) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
};

export function ColumnVisibilityPicker<K extends string>({
  groups,
  selected,
  selectedToggleableCount,
  totalToggleableCount,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: ColumnVisibilityPickerProps<K>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Choose columns" title="Choose columns">
          <Columns3 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3 p-3">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <Typography variant="small" className="text-muted-foreground">
            {selectedToggleableCount} / {totalToggleableCount} columns selected
          </Typography>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={onSelectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={onDeselectAll}>
              Deselect All
            </Button>
          </div>
        </div>

        <div
          className="overflow-y-auto overscroll-contain pr-1"
          style={{
            maxHeight:
              'min(16rem, calc(var(--radix-popover-content-available-height, 20rem) - 4.5rem))',
          }}
        >
          <div className="flex flex-col gap-4 pb-0.5">
            {groups.map((group) => (
              <div key={group.group} className="flex flex-col gap-2">
                <Typography
                  variant="small"
                  className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]"
                >
                  {group.group}
                </Typography>
                <div className="grid grid-cols-1 gap-y-1.5">
                  {group.columns.map((col: PageColumnDef<K>) => (
                    <div key={col.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`page-col-${col.key}`}
                        checked={selected.has(col.key)}
                        disabled={col.pinned}
                        onCheckedChange={() => onToggle(col.key)}
                      />
                      <Label
                        htmlFor={`page-col-${col.key}`}
                        className={`text-xs font-normal leading-tight ${
                          col.pinned ? 'text-muted-foreground cursor-default' : 'cursor-pointer'
                        }`}
                      >
                        {col.label}
                        {col.pinned ? ' (always visible)' : ''}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
