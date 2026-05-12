"use client";

import { useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  AipSearchResponse,
  AipSearchResultItem,
  BetterFetchResponse,
  SupplementalItemResponse,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  mode: "add" | "edit";
  editItem?: SupplementalItemResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

type FormState = {
  supplementalOrAugmentation: string;
  charges: string;
  amount: string;
  supplementalType: "less" | "add";
};

function makeEmptyForm(): FormState {
  return {
    supplementalOrAugmentation: "",
    charges: "",
    amount: "",
    supplementalType: "less",
  };
}

function makeEditForm(item: SupplementalItemResponse): FormState {
  return {
    supplementalOrAugmentation: item.supplementalOrAugmentation ?? "",
    charges: item.charges ?? "",
    amount: item.amount,
    supplementalType: item.supplementalType,
  };
}

function makeInitialAip(item: SupplementalItemResponse | undefined): {
  id: string;
  code: string;
  description: string;
} | null {
  if (!item?.aipCode) return null;

  return {
    id: item.aipCode.id,
    code: item.aipCode.aipRefCode,
    description: item.aipCode.description,
  };
}

export function SupplementalFormDialog({ mode, editItem, open, onOpenChange, onSuccess }: Props) {
  const [form, setForm] = useState<FormState>(() =>
    mode === "edit" && editItem ? makeEditForm(editItem) : makeEmptyForm(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [selectedAip, setSelectedAip] = useState<{ id: string; code: string; description: string } | null>(
    () => makeInitialAip(editItem),
  );

  const update = (key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.amount.trim()) {
      alert("Amount is required.");
      return;
    }

    setSubmitting(true);

    if (mode === "add") {
      const payload: Record<string, unknown> = {
        amount: form.amount.trim(),
        supplementalType: form.supplementalType,
        ...(form.supplementalOrAugmentation.trim()
          ? { supplementalOrAugmentation: form.supplementalOrAugmentation.trim() }
          : {}),
        ...(form.charges.trim() ? { charges: form.charges.trim() } : {}),
        ...(selectedAip ? { aipCode: selectedAip.id } : {}),
      };

      const res = await $fetch<unknown, ApiResponseException>("/api/supplemental", {
        method: "POST",
        body: payload,
      });

      setSubmitting(false);
      if (res.error) {
        alert((res.error as ApiResponseException).message ?? "Failed to create entry. Please try again.");
        return;
      }
    } else {
      const payload: Record<string, unknown> = {
        amount: form.amount.trim(),
        supplementalType: form.supplementalType,
        ...(form.supplementalOrAugmentation.trim()
          ? { supplementalOrAugmentation: form.supplementalOrAugmentation.trim() }
          : {}),
        ...(form.charges.trim() ? { charges: form.charges.trim() } : {}),
        ...(selectedAip ? { aipCode: selectedAip.id } : {}),
      };

      const res = await $fetch<unknown, ApiResponseException>(`/api/supplemental/${editItem!.id}`, {
        method: "PATCH",
        body: payload,
      });

      setSubmitting(false);
      if (res.error) {
        alert((res.error as ApiResponseException).message ?? "Failed to update entry. Please try again.");
        return;
      }
    }

    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add Supplemental Entry" : "Edit Supplemental Entry"}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Fill in the details to create a new supplemental entry."
              : "Update the details of the selected supplemental entry."}
          </DialogDescription>
        </DialogHeader>

        <form id="supplemental-form" onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="supplementalOrAugmentation">Supplemental/Augmentation</Label>
            <Input
              id="supplementalOrAugmentation"
              placeholder="Enter supplemental/augmentation"
              value={form.supplementalOrAugmentation}
              onInput={e => update("supplementalOrAugmentation", e.currentTarget.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="charges">Charges</Label>
            <Input
              id="charges"
              placeholder="Enter charges"
              value={form.charges}
              onInput={e => update("charges", e.currentTarget.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="supplementalType">Type</Label>
              <Select
                value={form.supplementalType}
                onValueChange={v => update("supplementalType", v as "less" | "add")}
              >
                <SelectTrigger id="supplementalType">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="less">Less: Source of Funds</SelectItem>
                  <SelectItem value="add">Add: Object of Expenditures</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="amount">
                Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                id="amount"
                placeholder="0.00"
                value={form.amount}
                onInput={e => update("amount", e.currentTarget.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="aipCode">AIP Code</Label>
            <AipSearchCombobox
              value={selectedAip}
              onChange={setSelectedAip}
              disabled={submitting}
            />
          </div>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button type="submit" form="supplemental-form" disabled={submitting}>
            {submitting ? "Saving..." : mode === "add" ? "Create" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AipSearchCombobox({
  value,
  onChange,
  disabled,
}: {
  value: { id: string; code: string; description: string } | null;
  onChange: (val: { id: string; code: string; description: string }) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useSWR<BetterFetchResponse<AipSearchResponse, ApiResponseException>>(
    !disabled && open && query.length >= 2 ? `/api/aip/search?query=${encodeURIComponent(query)}` : null,
    $fetch,
  );

  const results = data?.data?.data ?? [];

  return (
    <div className="relative flex flex-1 flex-col gap-1">
      <Input
        id="aipCode"
        placeholder="Search AIP code or description..."
        value={open ? query : (value ? `${value.code} — ${value.description}` : "")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => {
          setQuery(e.target.value);
        }}
        disabled={disabled}
      />
      {open && (
        <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {isLoading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>}
          {!isLoading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found.</div>
          )}
          {!isLoading && query.length < 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Type at least 2 characters to search.</div>
          )}
          {results.map(r => (
            <AipSearchOption key={r.id} item={r} onSelect={onChange} close={() => {
              setOpen(false);
              setQuery("");
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function AipSearchOption({
  item,
  onSelect,
  close,
}: {
  item: AipSearchResultItem;
  onSelect: (val: { id: string; code: string; description: string }) => void;
  close: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
      onMouseDown={() => {
        onSelect({ id: item.id, code: item.aipReferenceCode, description: item.description });
        close();
      }}
    >
      <span className="font-medium">{item.aipReferenceCode}</span>
      <span className="text-xs text-muted-foreground">{item.description}</span>
    </button>
  );
}
