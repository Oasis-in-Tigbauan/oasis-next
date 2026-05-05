"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  SupplementalItemResponse,
  SupplementalListResponse,
} from "@/lib/http/client/responses";

import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import { SupplementalFormDialog } from "@/app/(user_required)/(verified_only)/(supplemental_users)/dashboard/supplemental/supplemental-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<SupplementalListResponse, ApiResponseException>>(
    "/api/supplemental",
    $fetch,
  );

  const [selectedItem, setSelectedItem] = useState<SupplementalItemResponse | null>(null);
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
          onClick={() => {
            setAddKey(k => k + 1);
            setAddOpen(true);
          }}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          disabled={!selectedItem}
          onClick={() => {
            if (selectedItem) setEditOpen(true);
          }}
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
            const confirmed = confirm("Delete this supplemental entry? This cannot be undone.");
            if (!confirmed) return;

            const res = await $fetch<unknown, ApiResponseException>(`/api/supplemental/${selectedItem.id}`, {
              method: "DELETE",
            });
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
              <TableHead>Supplemental/Augmentation</TableHead>
              <TableHead>Charges</TableHead>
              <TableHead>Less: Source of Funds</TableHead>
              <TableHead>Add: Object of Expenditures</TableHead>
              <TableHead>Quarter</TableHead>
              <TableHead>AIP Code</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <SupplementalTableRow
                key={item.id}
                item={item}
                selected={selectedItem?.id === item.id}
                onSelect={() => setSelectedItem(prev => (prev?.id === item.id ? null : item))}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <SupplementalFormDialog
        key={addKey}
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => mutate()}
      />
      <SupplementalFormDialog
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

function SupplementalTableRow({
  item,
  selected,
  onSelect,
}: {
  item: SupplementalItemResponse;
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
      <TableCell>{item.supplementalOrAugmentation ?? "—"}</TableCell>
      <TableCell>{item.charges ?? "—"}</TableCell>
      <TableCell>{item.supplementalType === "less" ? item.amount : "—"}</TableCell>
      <TableCell>{item.supplementalType === "add" ? item.amount : "—"}</TableCell>
      <TableCell>{item.quarter}</TableCell>
      <TableCell>{item.aipCode ?? "—"}</TableCell>
    </TableRow>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
  });
}
