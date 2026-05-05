"use client";

import { useState } from "react";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
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
  aipCode: string;
};

function makeEmptyForm(): FormState {
  return {
    supplementalOrAugmentation: "",
    charges: "",
    amount: "",
    supplementalType: "less",
    aipCode: "",
  };
}

function makeEditForm(item: SupplementalItemResponse): FormState {
  return {
    supplementalOrAugmentation: item.supplementalOrAugmentation ?? "",
    charges: item.charges ?? "",
    amount: item.amount,
    supplementalType: item.supplementalType,
    aipCode: item.aipCode ?? "",
  };
}

export function SupplementalFormDialog({ mode, editItem, open, onOpenChange, onSuccess }: Props) {
  const [form, setForm] = useState<FormState>(() =>
    mode === "edit" && editItem ? makeEditForm(editItem) : makeEmptyForm(),
  );
  const [submitting, setSubmitting] = useState(false);

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
        ...(form.aipCode.trim() ? { aipCode: form.aipCode.trim() } : {}),
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
        ...(form.aipCode.trim() ? { aipCode: form.aipCode.trim() } : {}),
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
            <Input
              id="aipCode"
              placeholder="Enter AIP code"
              value={form.aipCode}
              onInput={e => update("aipCode", e.currentTarget.value)}
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
