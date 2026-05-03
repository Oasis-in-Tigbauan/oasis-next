"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  EsreItemResponse,
  EsreListResponse,
} from "@/lib/http/client/responses";

import { Button } from "@/components/ui/button";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EsreFormDialog } from "@/app/(user_required)/(verified_only)/(esre_users)/dashboard/esre/esre-form-dialog";

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<EsreListResponse, ApiResponseException>>(
    "/api/esre",
    $fetch,
  );

  const [selectedItem, setSelectedItem] = useState<EsreItemResponse | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  const items = data?.data?.data ?? [];

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex gap-1 p-2 border rounded-lg w-full">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Add"
          onClick={() => { setAddKey(k => k + 1); setAddOpen(true); }}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          disabled={!selectedItem}
          onClick={() => { if (selectedItem) setEditOpen(true); }}
        >
          <Pencil />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Delete"
          disabled={!selectedItem}
          onClick={async () => {
            if (!selectedItem) return;
            const confirmed = confirm(`Delete this ESRE entry for "${selectedItem.payee}"? This cannot be undone.`);
            if (!confirmed) return;
            const res = await $fetch<unknown, ApiResponseException>(`/api/esre/${selectedItem.id}`, { method: "DELETE" });
            if (res.error) {
              alert((res.error as ApiResponseException).message ?? "Failed to delete entry. Please try again.");
              return;
            }
            setSelectedItem(null);
            mutate();
          }}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Check Number</TableHead>
              <TableHead>Funding Source</TableHead>
              <TableHead>DV/Payroll No.</TableHead>
              <TableHead>ORS/BURS No.</TableHead>
              <TableHead>Expense Class</TableHead>
              <TableHead>Office</TableHead>
              <TableHead>Expense Name</TableHead>
              <TableHead>Account Code</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Nature of Payment</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Check Status</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead>Expense Type</TableHead>
              <TableHead>Disbursed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <EsreTableRow
                key={item.id}
                item={item}
                selected={selectedItem?.id === item.id}
                onSelect={() => setSelectedItem(prev => prev?.id === item.id ? null : item)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <EsreFormDialog
        key={addKey}
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => mutate()}
      />
      <EsreFormDialog
        key={selectedItem?.id ?? "edit-no-selection"}
        mode="edit"
        editItem={selectedItem ?? undefined}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => mutate()}
      />
    </div>
  );
}

function EsreTableRow({
  item,
  selected,
  onSelect,
}: {
  item: EsreItemResponse;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TableRow
      className={selected ? "bg-accent" : undefined}
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      <TableCell>{formatDate(item.date)}</TableCell>
      <TableCell>{item.checkNumber ?? "—"}</TableCell>
      <TableCell>{item.fundingSource.name}</TableCell>
      <TableCell>{item.dvOrPayrollNumber ?? "—"}</TableCell>
      <TableCell>{item.obr?.requestNumber ?? "—"}</TableCell>
      <TableCell>{item.obr?.expenseClass.subClassification ?? "—"}</TableCell>
      <TableCell>{item.obr?.office.name ?? "—"}</TableCell>
      <TableCell>{item.obr?.expenseClass.accountName ?? "—"}</TableCell>
      <TableCell>{item.obr?.expenseClass.accountCode ?? "—"}</TableCell>
      <TableCell>{item.payee}</TableCell>
      <TableCell>{item.natureOfPayment}</TableCell>
      <TableCell>{item.amount}</TableCell>
      <TableCell>{item.checkStatus ?? "—"}</TableCell>
      <TableCell>{item.remarks ?? "—"}</TableCell>
      <TableCell>{item.expenseType?.name ?? "—"}</TableCell>
      <TableCell>{item.disbursed}</TableCell>
    </TableRow>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
  });
}

