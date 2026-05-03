"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  ObrItem,
  ObrItemListResponse,
} from "@/lib/http/client/responses";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatCurrency(value: string | null): string {
  if (!value) return "-";

  const trimmed = value.trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(trimmed)) return "-";

  const isNegative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[-+]/, "");
  const [rawInt, rawFrac = ""] = unsigned.split(".");

  const normalizedInt = rawInt.replace(/^0+(?=\d)/, "") || "0";
  const paddedFrac = (rawFrac + "000").slice(0, 3);
  const centPart = paddedFrac.slice(0, 2);
  const roundingDigit = Number.parseInt(paddedFrac[2] ?? "0", 10);

  let cents = BigInt(`${normalizedInt}${centPart}`);
  if (roundingDigit >= 5) cents += 1n;

  const centsStr = cents.toString().padStart(3, "0");
  const integerPart = centsStr.slice(0, -2) || "0";
  const fractionalPart = centsStr.slice(-2);
  const intWithGrouping = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const roundedIsZero = cents === 0n;
  const sign = isNegative && !roundedIsZero ? "-" : "";

  return `${sign}PHP ${intWithGrouping}.${fractionalPart}`;
}

function DetailText({ value, className }: { value: string; className?: string }) {
  return (
    <div className={`rounded-md border bg-muted/30 px-3 py-2 text-sm ${className ?? ""}`.trim()}>
      {value}
    </div>
  );
}

export default function Page() {
  const { data, error, isLoading } = useSWR<
    BetterFetchResponse<ObrItemListResponse, ApiResponseException>
  >("/api/obr/management", $fetch);

  const [selected, setSelected] = useState<ObrItem | null>(null);
  const [open, setOpen] = useState(false);

  const handleRowClick = useCallback((item: ObrItem) => {
    setSelected(item);
    setOpen(true);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setSelected(null);
  }, []);

  if (isLoading) return <Loading />;

  if (error || data?.error || !data?.data?.data) {
    return <DeadHamster />;
  }

  const items = data.data.data;

  return (
    <div className="relative flex w-full flex-col overflow-x-hidden p-4">
      <Typography variant="h3" className="mb-4 grow">OBR Management</Typography>

      <div className="w-full overflow-x-auto">
        <Table className="min-w-max">
          {items.length === 0 && (
            <TableCaption>No created OBR items found.</TableCaption>
          )}
          <TableHeader>
            <TableRow>
              <TableHead>OBR Reference No.</TableHead>
              <TableHead>Disbursement Voucher Reference No.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Particulars</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead>Requesting Official</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow
                key={item.id}
                className="cursor-pointer"
                onClick={() => handleRowClick(item)}
              >
                <TableCell className="font-medium">{item.obrRefNumber}</TableCell>
                <TableCell className="font-medium">{item.dvRefNumber}</TableCell>
                <TableCell>{formatDate(item.date)}</TableCell>
                <TableCell>{item.payee}</TableCell>
                <TableCell className="max-w-[24rem] truncate" title={item.particulars}>
                  {item.particulars}
                </TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(item.overallAmount)}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{item.requestingOfficial.name}</span>
                    <span className="text-xs text-muted-foreground">{item.requestingOfficial.position}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ObrItemDetailDialog item={selected} open={open} onOpenChange={handleOpenChange} />
    </div>
  );
}

function ObrItemDetailDialog({
  item,
  open,
  onOpenChange,
}: {
  item: ObrItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[75%]">
        <DialogHeader>
          <DialogTitle>OBR Item Details</DialogTitle>
          <DialogDescription>
            Review full OBR item information and amount line breakdown.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-1">
          <div className="flex flex-col gap-4 pb-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1">
                <Label>OBR Reference No.</Label>
                <DetailText value={item.obrRefNumber} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Disbursement Voucher Reference No.</Label>
                <DetailText value={item.dvRefNumber} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Date</Label>
                <DetailText value={formatDate(item.date)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Payee</Label>
                <DetailText value={item.payee} />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <Label>Address</Label>
                <DetailText value={item.address} />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-3">
                <Label>Particulars</Label>
                <DetailText value={item.particulars} className="min-h-10" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label>Published By</Label>
                <DetailText value={item.publisher.name} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Position</Label>
                <DetailText value={item.publisher.position} />
              </div>
            </div>

            <Separator />

            <div>
              <Typography variant="muted" className="mb-2 text-xs font-semibold uppercase">
                Requesting Official
              </Typography>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label>Name</Label>
                  <DetailText value={item.requestingOfficial.name} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Position</Label>
                  <DetailText value={item.requestingOfficial.position} />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <Typography variant="muted" className="mb-2 text-xs font-semibold uppercase">
                Amounts
              </Typography>
              <div className="flex flex-col gap-3">
                {item.amounts.map(amount => (
                  <div key={amount.id} className="grid grid-cols-1 gap-3 rounded-md border p-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <Label>Responsibility Center</Label>
                      <DetailText value={amount.responsibilityCenter.name} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label>Expense Code</Label>
                      <DetailText value={amount.expenseCode.name} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label>Account Code</Label>
                      <DetailText value={amount.expenseCode.accountCode ?? "-"} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label>Amount</Label>
                      <DetailText value={formatCurrency(amount.amount)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1 lg:col-start-3">
                <Label>Overall Amount</Label>
                <DetailText value={formatCurrency(item.overallAmount)} className="font-mono" />
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
