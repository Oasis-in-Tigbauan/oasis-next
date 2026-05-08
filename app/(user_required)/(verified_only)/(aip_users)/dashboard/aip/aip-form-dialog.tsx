"use client";

import { useMemo, useState } from "react";
import { Repeat } from "lucide-react";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  AipReferenceResponse,
  AipReferenceSingleResponse,
  ApiResponseException,
} from "@/lib/http/client/responses";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

type EntryType = "group" | "item";

type AipFormState = {
  aipReferenceCode: string;
  description: string;
  implementationStart: string;
  implementationCompletion: string;
  sector: string;
  code: string;
  office: string;
  implementingOffice: string;
  expectedOutputs: string;
  fundingSource: string;
  amountPS: string;
  amountMOOE: string;
  amountCO: string;
  amountCCAdapt: string;
  amountCCMitigate: string;
  ccTopologyCode: string;
  gadable: boolean;
  gadAmount: string;
};

function makeEmptyForm(): AipFormState {
  return {
    aipReferenceCode: "",
    description: "",
    implementationStart: "",
    implementationCompletion: "",
    sector: "",
    code: "",
    office: "",
    implementingOffice: "",
    expectedOutputs: "",
    fundingSource: "",
    amountPS: "",
    amountMOOE: "",
    amountCO: "",
    amountCCAdapt: "",
    amountCCMitigate: "",
    ccTopologyCode: "",
    gadable: false,
    gadAmount: "",
  };
}

function makeEditForm(item: AipReferenceResponse): AipFormState {
  return {
    aipReferenceCode: item.aipReferenceCode,
    description: item.description,
    implementationStart: item.implementationStart?.toString() ?? "",
    implementationCompletion: item.implementationCompletion?.toString() ?? "",
    sector: item.sector ?? "",
    code: item.code ?? "",
    office: item.office ?? "",
    implementingOffice: item.implementingOffice ?? "",
    expectedOutputs: item.expectedOutputs ?? "",
    fundingSource: item.fundingSource ?? "",
    amountPS: item.amountPS ?? "",
    amountMOOE: item.amountMOOE ?? "",
    amountCO: item.amountCO ?? "",
    amountCCAdapt: item.amountCCAdapt ?? "",
    amountCCMitigate: item.amountCCMitigate ?? "",
    ccTopologyCode: item.ccTopologyCode ?? "",
    gadable: item.gadable,
    gadAmount: item.gadAmount ?? "",
  };
}

function asMonth(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 12) return undefined;
  return n;
}

function putIfNotEmpty(target: Record<string, unknown>, key: string, value: string) {
  if (!value.trim()) return;
  target[key] = value.trim();
}

type Props = {
  mode: "add" | "edit";
  entryType: EntryType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (saved: AipReferenceResponse) => void;
  onConvert?: (item: AipReferenceResponse, targetType: EntryType) => Promise<void>;
  editItem?: AipReferenceResponse;
  parentGroupId?: string;
};

export function AipFormDialog({
  mode,
  entryType,
  open,
  onOpenChange,
  onSuccess,
  onConvert,
  editItem,
  parentGroupId,
}: Props) {
  const initialForm = mode === "edit" && editItem ? makeEditForm(editItem) : makeEmptyForm();
  const [form, setForm] = useState<AipFormState>(() =>
    initialForm,
  );
  const [submitting, setSubmitting] = useState(false);
  const [converting, setConverting] = useState(false);

  const currentType: EntryType = mode === "edit" ? editItem?.type ?? entryType : entryType;

  const isValid = useMemo(() => {
    if (!form.aipReferenceCode.trim() || !form.description.trim()) {
      return false;
    }

    if (currentType === "item") {
      if (!asMonth(form.implementationStart) || !asMonth(form.implementationCompletion)) {
        return false;
      }

      if (mode === "add" && !parentGroupId) {
        return false;
      }
    }

    return true;
  }, [form, currentType, mode, parentGroupId]);

  const update = (key: keyof AipFormState, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleConvert = async () => {
    if (mode !== "edit" || !editItem || !onConvert) return;

    const targetType: EntryType = editItem.type === "group" ? "item" : "group";
    const confirmed = confirm(
      `Convert this ${editItem.type} to ${targetType}? This requires confirmation and keeps shared fields when possible.`,
    );
    if (!confirmed) return;

    setConverting(true);
    await onConvert(editItem, targetType);
    setConverting(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    const payload: Record<string, unknown> = {
      aipReferenceCode: form.aipReferenceCode.trim(),
      description: form.description.trim(),
      gadable: form.gadable,
    };

    const implementationStart = asMonth(form.implementationStart);
    const implementationCompletion = asMonth(form.implementationCompletion);

    if (currentType === "item") {
      payload.implementationStart = implementationStart;
      payload.implementationCompletion = implementationCompletion;
    } else {
      if (implementationStart !== undefined) payload.implementationStart = implementationStart;
      if (implementationCompletion !== undefined) payload.implementationCompletion = implementationCompletion;
    }

    if (mode === "add") {
      if (currentType === "group") {
        if (parentGroupId) {
          payload.parentId = parentGroupId;
        }
      } else {
        payload.parentId = parentGroupId;
      }
    }

    putIfNotEmpty(payload, "sector", form.sector);
    putIfNotEmpty(payload, "code", form.code);
    putIfNotEmpty(payload, "office", form.office);
    putIfNotEmpty(payload, "implementingOffice", form.implementingOffice);
    putIfNotEmpty(payload, "expectedOutputs", form.expectedOutputs);
    putIfNotEmpty(payload, "fundingSource", form.fundingSource);
    putIfNotEmpty(payload, "amountPS", form.amountPS);
    putIfNotEmpty(payload, "amountMOOE", form.amountMOOE);
    putIfNotEmpty(payload, "amountCO", form.amountCO);
    putIfNotEmpty(payload, "amountCCAdapt", form.amountCCAdapt);
    putIfNotEmpty(payload, "amountCCMitigate", form.amountCCMitigate);
    putIfNotEmpty(payload, "ccTopologyCode", form.ccTopologyCode);
    putIfNotEmpty(payload, "gadAmount", form.gadAmount);

    setSubmitting(true);

    const base = currentType === "group" ? "/api/aip/groups" : "/api/aip/items";
    const url = mode === "add" ? base : `${base}/${editItem!.id}`;

    const response = await $fetch<AipReferenceSingleResponse, ApiResponseException>(url, {
      method: mode === "add" ? "POST" : "PATCH",
      body: payload,
    });

    setSubmitting(false);

    if (response.error) {
      alert(response.error.message ?? "Failed to save AIP reference. Please try again.");
      return;
    }

    const saved = response.data?.data;
    if (!saved) {
      alert("Failed to read saved AIP reference.");
      return;
    }

    onSuccess(saved);
    if (mode === "add") {
      setForm(makeEmptyForm());
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[80%] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === "add"
              ? `Add ${currentType === "group" ? "Group" : "Item"}`
              : `Edit ${currentType === "group" ? "Group" : "Item"}`}
          </DialogTitle>
          <DialogDescription>
            {currentType === "group"
              ? "Groups can be root or nested under another group."
              : "Items are created under a selected group in this UI."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <form id="aip-form" onSubmit={handleSubmit} className="flex flex-col gap-6 px-1 pb-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="aipReferenceCode">
                  AIP Reference Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="aipReferenceCode"
                  value={form.aipReferenceCode}
                  onInput={e => update("aipReferenceCode", e.currentTarget.value)}
                  placeholder="Enter AIP reference code"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="implementationStart">
                  Implementation Start{currentType === "item" ? <span className="text-destructive"> *</span> : null}
                </Label>
                <Input
                  id="implementationStart"
                  type="number"
                  min={1}
                  max={12}
                  value={form.implementationStart}
                  onInput={e => update("implementationStart", e.currentTarget.value)}
                  placeholder="1-12"
                  required={currentType === "item"}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="implementationCompletion">
                  Implementation Completion{currentType === "item" ? <span className="text-destructive"> *</span> : null}
                </Label>
                <Input
                  id="implementationCompletion"
                  type="number"
                  min={1}
                  max={12}
                  value={form.implementationCompletion}
                  onInput={e => update("implementationCompletion", e.currentTarget.value)}
                  placeholder="1-12"
                  required={currentType === "item"}
                />
              </div>

              <div className="col-span-3 flex flex-col gap-2">
                <Label htmlFor="description">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onInput={e => update("description", e.currentTarget.value)}
                  placeholder="Enter description"
                  rows={3}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sector">Sector</Label>
                <Input
                  id="sector"
                  value={form.sector}
                  onInput={e => update("sector", e.currentTarget.value)}
                  placeholder="Enter sector"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={form.code}
                  onInput={e => update("code", e.currentTarget.value)}
                  placeholder="Enter code"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="office">Office</Label>
                <Input
                  id="office"
                  value={form.office}
                  onInput={e => update("office", e.currentTarget.value)}
                  placeholder="Enter office"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="implementingOffice">Implementing Office</Label>
                <Input
                  id="implementingOffice"
                  value={form.implementingOffice}
                  onInput={e => update("implementingOffice", e.currentTarget.value)}
                  placeholder="Enter implementing office"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fundingSource">Funding Source</Label>
                <Input
                  id="fundingSource"
                  value={form.fundingSource}
                  onInput={e => update("fundingSource", e.currentTarget.value)}
                  placeholder="Enter funding source"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ccTopologyCode">CC Topology Code</Label>
                <Input
                  id="ccTopologyCode"
                  value={form.ccTopologyCode}
                  onInput={e => update("ccTopologyCode", e.currentTarget.value)}
                  placeholder="Enter CC topology code"
                />
              </div>

              <div className="col-span-3 flex flex-col gap-2">
                <Label htmlFor="expectedOutputs">Expected Outputs</Label>
                <Textarea
                  id="expectedOutputs"
                  value={form.expectedOutputs}
                  onInput={e => update("expectedOutputs", e.currentTarget.value)}
                  placeholder="Enter expected outputs"
                  rows={3}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="amountPS">Amount PS</Label>
                <Input
                  id="amountPS"
                  value={form.amountPS}
                  onInput={e => update("amountPS", e.currentTarget.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="amountMOOE">Amount MOOE</Label>
                <Input
                  id="amountMOOE"
                  value={form.amountMOOE}
                  onInput={e => update("amountMOOE", e.currentTarget.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="amountCO">Amount CO</Label>
                <Input
                  id="amountCO"
                  value={form.amountCO}
                  onInput={e => update("amountCO", e.currentTarget.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="amountCCAdapt">Amount CC Adapt</Label>
                <Input
                  id="amountCCAdapt"
                  value={form.amountCCAdapt}
                  onInput={e => update("amountCCAdapt", e.currentTarget.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="amountCCMitigate">Amount CC Mitigate</Label>
                <Input
                  id="amountCCMitigate"
                  value={form.amountCCMitigate}
                  onInput={e => update("amountCCMitigate", e.currentTarget.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="gadAmount">GAD Amount</Label>
                <Input
                  id="gadAmount"
                  value={form.gadAmount}
                  onInput={e => update("gadAmount", e.currentTarget.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="col-span-3 flex items-center gap-2">
                <Checkbox
                  id="gadable"
                  checked={form.gadable}
                  onCheckedChange={checked => update("gadable", checked === true)}
                />
                <Label htmlFor="gadable">GAD-able</Label>
              </div>
            </div>
          </form>
        </ScrollArea>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {mode === "edit" && editItem && onConvert && (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={handleConvert}
                disabled={converting || submitting}
                title={editItem.type === "group" ? "Convert group to item" : "Convert item to group"}
                aria-label={editItem.type === "group" ? "Convert group to item" : "Convert item to group"}
              >
                <Repeat />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={submitting || converting}>Cancel</Button>
            </DialogClose>
            <Button type="submit" form="aip-form" disabled={!isValid || submitting || converting}>
              {submitting ? "Saving..." : mode === "add" ? "Create" : "Update"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
