"use client";

import { useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  EsreItemResponse,
  ExpenseTypeListResponse,
  FundTypesListResponse,
  ObrSearchItem,
  ObrSearchResponse,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CHECK_STATUS_OPTIONS = ["PAID", "FOR RELEASE", "ON HOLD", "CANCELLED"] as const;

type FormState = {
  checkNumber: string;
  checkStatus: string;
  fundingSourceId: string;
  payee: string;
  natureOfPayment: string;
  amount: string;
  expenseTypeId: string;
  remarks: string;
};

function makeEmptyForm(): FormState {
  return {
    checkNumber: "",
    checkStatus: "",
    fundingSourceId: "",
    payee: "",
    natureOfPayment: "",
    amount: "",
    expenseTypeId: "",
    remarks: "",
  };
}

function makeEditForm(item: EsreItemResponse): FormState {
  return {
    checkNumber: item.checkNumber ?? "",
    checkStatus: item.checkStatus ?? "",
    fundingSourceId: item.fundingSource.id,
    payee: item.payee,
    natureOfPayment: item.natureOfPayment,
    amount: item.amount,
    expenseTypeId: item.expenseType?.id ?? "",
    remarks: item.remarks ?? "",
  };
}

function makeInitialObr(editItem: EsreItemResponse | undefined): ObrSearchItem | null {
  if (!editItem?.obr) return null;
  return {
    id: editItem.obr.id,
    obrRefNumber: editItem.obr.requestNumber,
    dvRefNumber: "",
    payee: "",
    address: "",
    particulars: "",
    expenseClass: editItem.obr.expenseClass ? { ...editItem.obr.expenseClass } : null,
    office: editItem.obr.office ?? null,
  };
}

type Props = {
  mode: "add" | "edit";
  editItem?: EsreItemResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function EsreFormDialog({ mode, editItem, open, onOpenChange, onSuccess }: Props) {
  const [form, setForm] = useState<FormState>(() =>
    mode === "edit" && editItem ? makeEditForm(editItem) : makeEmptyForm(),
  );
  const [submitting, setSubmitting] = useState(false);

  const [obrQuery, setObrQuery] = useState(() =>
    mode === "edit" && editItem?.obr ? editItem.obr.requestNumber : "",
  );
  const [obrDropdownOpen, setObrDropdownOpen] = useState(false);
  const [selectedObr, setSelectedObr] = useState<ObrSearchItem | null>(() =>
    makeInitialObr(editItem),
  );

  // Data sources <only fetch when the dialog is open
  const { data: fundTypeData } = useSWR<
    BetterFetchResponse<FundTypesListResponse, ApiResponseException>
  >(open ? "/api/management/data/fund-types" : null, $fetch);

  const { data: expenseTypeData } = useSWR<
    BetterFetchResponse<ExpenseTypeListResponse, ApiResponseException>
  >(open ? "/api/management/data/expense-type" : null, $fetch);

  const { data: obrSearchData, isLoading: obrSearchLoading } = useSWR<
    BetterFetchResponse<ObrSearchResponse, ApiResponseException>
  >(
    open && obrDropdownOpen && obrQuery.length > 0
      ? `/api/obr/search?query=${encodeURIComponent(obrQuery)}`
      : null,
    $fetch,
  );

  const fundTypes = fundTypeData?.data?.data ?? [];
  const expenseTypes = expenseTypeData?.data?.data ?? [];
  const obrResults = obrSearchData?.data?.data ?? [];

  const update = (key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.payee.trim() || !form.natureOfPayment.trim() || !form.amount.trim() || !form.fundingSourceId) {
      alert("Payee, Nature of Payment, Amount, and Funding Source are required.");
      return;
    }

    setSubmitting(true);

    if (mode === "add") {
      const payload: Record<string, unknown> = {
        payee: form.payee.trim(),
        natureOfPayment: form.natureOfPayment.trim(),
        amount: form.amount.trim(),
        fundingSourceId: form.fundingSourceId,
        ...(form.checkNumber.trim() ? { checkNumber: form.checkNumber.trim() } : {}),
        ...(form.remarks.trim() ? { remarks: form.remarks.trim() } : {}),
        ...(selectedObr ? { obrId: selectedObr.id } : {}),
        ...(form.expenseTypeId ? { expenseTypeId: form.expenseTypeId } : {}),
      };

      const res = await $fetch<unknown, ApiResponseException>("/api/esre", {
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
        payee: form.payee.trim(),
        natureOfPayment: form.natureOfPayment.trim(),
        amount: form.amount.trim(),
        fundingSourceId: form.fundingSourceId,
        checkStatus: form.checkStatus || null,
        ...(form.checkNumber.trim() ? { checkNumber: form.checkNumber.trim() } : {}),
        ...(form.remarks.trim() ? { remarks: form.remarks.trim() } : {}),
        obrId: selectedObr ? selectedObr.id : null,
        ...(form.expenseTypeId ? { expenseTypeId: form.expenseTypeId } : {}),
      };

      const res = await $fetch<unknown, ApiResponseException>(`/api/esre/${editItem!.id}`, {
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
      <DialogContent className="min-w-[80%] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add ESRE Entry" : "Edit ESRE Entry"}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Fill in the details to create a new ESRE entry."
              : "Update the details of the selected ESRE entry."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <form id="esre-form" onSubmit={handleSubmit} className="flex flex-col gap-6 px-1 pb-2">

            {/* Section 1 <Check info (3-col) */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 flex flex-col gap-2">
                <Label htmlFor="checkNumber">Check Number</Label>
                <Input
                  id="checkNumber"
                  placeholder="Enter check number"
                  value={form.checkNumber}
                  onInput={e => update("checkNumber", e.currentTarget.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="checkStatus">Check Status</Label>
                <Select
                  value={form.checkStatus || "__none__"}
                  onValueChange={v => update("checkStatus", v === "__none__" ? "" : v)}
                  disabled={mode === "add"}
                >
                  <SelectTrigger id="checkStatus" className="w-full">
                    <SelectValue placeholder={mode === "add" ? "Set after creation" : "Select status"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">(None)</SelectItem>
                    {CHECK_STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Section 2 <Payment details (3-col) */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="fundingSourceId">
                  Funding Source <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.fundingSourceId}
                  onValueChange={v => update("fundingSourceId", v)}
                  required
                >
                  <SelectTrigger id="fundingSourceId" className="w-full">
                    <SelectValue placeholder="Select funding source" />
                  </SelectTrigger>
                  <SelectContent>
                    {fundTypes.map(ft => (
                      <SelectItem key={ft.id} value={ft.id}>{ft.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <Label htmlFor="payee">
                  Payee <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="payee"
                  placeholder="Enter payee name"
                  value={form.payee}
                  onInput={e => update("payee", e.currentTarget.value)}
                  required
                />
              </div>
              <div className="col-span-3 flex flex-col gap-2">
                <Label htmlFor="natureOfPayment">
                  Nature of Payment <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="natureOfPayment"
                  placeholder="Describe the nature of payment"
                  value={form.natureOfPayment}
                  onInput={e => update("natureOfPayment", e.currentTarget.value)}
                  rows={2}
                  required
                />
              </div>
              <div className="col-span-2 flex flex-col gap-2">
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="expenseTypeId">Expense Type</Label>
                <Select
                  value={form.expenseTypeId || "__none__"}
                  onValueChange={v => update("expenseTypeId", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id="expenseTypeId" className="w-full">
                    <SelectValue placeholder="Select expense type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">(None)</SelectItem>
                    {expenseTypes.map(et => (
                      <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3 flex flex-col gap-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  placeholder="Optional remarks"
                  value={form.remarks}
                  onInput={e => update("remarks", e.currentTarget.value)}
                  rows={2}
                />
              </div>
            </div>

            {/* Section 3 <OBR linking (3-col) */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3 flex flex-col gap-2">
                <Label htmlFor="obrSearch">OBR Item</Label>
                <div className="relative">
                  <Input
                    id="obrSearch"
                    placeholder="Search by payee, ORS/BURS no., address, particulars..."
                    value={obrQuery}
                    onFocus={() => setObrDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setObrDropdownOpen(false), 150)}
                    onInput={e => {
                      const value = e.currentTarget.value;
                      setObrQuery(value);
                      if (selectedObr && value !== selectedObr.obrRefNumber) {
                        setSelectedObr(null);
                      }
                    }}
                    autoComplete="off"
                  />
                  {selectedObr && (
                    <button
                      type="button"
                      aria-label="Clear OBR selection"
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSelectedObr(null);
                        setObrQuery("");
                      }}
                    >
                      ✕                    </button>
                  )}
                  {obrDropdownOpen && (obrSearchLoading || obrResults.length > 0) && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {obrSearchLoading ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
                      ) : (
                        obrResults.map(r => (
                          <button
                            key={r.id}
                            type="button"
                            className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                            onMouseDown={() => {
                              setSelectedObr(r);
                              setObrQuery(r.obrRefNumber);
                              setObrDropdownOpen(false);
                            }}
                          >
                            <span className="font-medium">{r.obrRefNumber}</span>
                            <span className="text-xs text-muted-foreground">{r.payee}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Readonly fields derived from selected OBR item */}
              <div className="flex flex-col gap-2">
                <Label>Expense Class</Label>
                <Input
                  value={selectedObr?.expenseClass?.subClassification ?? ""}
                  readOnly
                  placeholder=""
                  className="bg-muted/50"
                  tabIndex={-1}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Office</Label>
                <Input
                  value={selectedObr?.office?.name ?? ""}
                  readOnly
                  placeholder=""
                  className="bg-muted/50"
                  tabIndex={-1}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Expense Name</Label>
                <Input
                  value={selectedObr?.expenseClass?.accountName ?? ""}
                  readOnly
                  placeholder=""
                  className="bg-muted/50"
                  tabIndex={-1}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Account Code</Label>
                <Input
                  value={selectedObr?.expenseClass?.accountCode ?? ""}
                  readOnly
                  placeholder=""
                  className="bg-muted/50"
                  tabIndex={-1}
                />
              </div>
            </div>

          </form>
        </ScrollArea>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button type="submit" form="esre-form" disabled={submitting}>
            {submitting ? "Saving…" : mode === "add" ? "Create" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

