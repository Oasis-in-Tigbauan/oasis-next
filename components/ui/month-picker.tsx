"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export interface MonthPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

function parseYearFromValue(value: string): number | null {
  if (!value) return null;
  const monthYear = DateTime.fromFormat(value, "yyyy-LL", { zone: "Asia/Manila" });
  if (monthYear.isValid) return monthYear.year;
  const iso = DateTime.fromISO(value, { zone: "Asia/Manila" });
  if (iso.isValid) return iso.year;
  return null;
}

function formatDisplayLabel(value: string): string | null {
  if (!value) return null;
  const monthYear = DateTime.fromFormat(value, "yyyy-LL", { zone: "Asia/Manila" });
  if (monthYear.isValid) return monthYear.toFormat("LLLL yyyy");
  const iso = DateTime.fromISO(value, { zone: "Asia/Manila" });
  if (iso.isValid) return iso.toFormat("LLLL yyyy");
  const monthNameYear = DateTime.fromFormat(value, "LLLL yyyy", { zone: "Asia/Manila" });
  if (monthNameYear.isValid) return monthNameYear.toFormat("LLLL yyyy");
  return null;
}

export function MonthPicker({
  value,
  onChange,
  disabled = false,
  placeholder = "Select month",
  id,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(() => {
    return parseYearFromValue(value) ?? DateTime.now().setZone("Asia/Manila").year;
  });

  useEffect(() => {
    const yearFromValue = parseYearFromValue(value);
    if (yearFromValue !== null) {
      setDisplayYear(yearFromValue);
    }
  }, [value]);

  const displayLabel = useMemo(() => formatDisplayLabel(value), [value]);

  const handleMonthSelect = (month: number) => {
    const monthValue = DateTime.fromObject(
      { year: displayYear, month, day: 1 },
      { zone: "Asia/Manila" },
    ).toFormat("yyyy-LL");
    onChange(monthValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !displayLabel && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4" />
          {displayLabel ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous year"
            onClick={() => setDisplayYear(prev => prev - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium">{displayYear}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next year"
            onClick={() => setDisplayYear(prev => prev + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map(month => {
            const monthValue = DateTime.fromObject(
              { year: displayYear, month, day: 1 },
              { zone: "Asia/Manila" },
            ).toFormat("yyyy-LL");
            const isSelected = value === monthValue;
            const monthLabel = DateTime.fromObject(
              { year: displayYear, month, day: 1 },
              { zone: "Asia/Manila" },
            ).toFormat("LLL");

            return (
              <Button
                key={month}
                type="button"
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => handleMonthSelect(month)}
              >
                {monthLabel}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
