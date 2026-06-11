"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  LbacSearchGroupItem,
  LbacSearchResponse,
  LbacSearchResultItem,
  ProcurementTypesListResponse,
  PurchasingItemResponse,
  PurchasingValidSignatoriesResponse,
} from "@/lib/http/client/responses";
import { isLbacSearchGroup } from "@/lib/http/client/responses";

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
import { Separator } from "@/components/ui/separator";

type PurchasingFormDialogProps = {
  mode: "add" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editItem?: PurchasingItemResponse;
};

type PurchaseOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  items?: PurchasingItemResponse[];
};

type PurchasingFormState = {
  prNumber: string;
  purpose: string;
  supplier: string;
  address: string;
  tinNumber: string;
  purchaseOrderNumber: string;
  modeOfProcurementId: string;
  placeOfDelivery: string;
  dateOfDelivery: string;
  deliveryTerm: string;
  paymentTerm: string;
};

type RequestItemFormState = {
  key: string;
  unit: string;
  itemDescription: string;
  quantity: string;
  unitCost: string;
};

type SignatoryFormState = {
  headOfOfficeId: string;
  treasurerId: string;
  approverId: string;
};

type SelectedAip = {
  key: string;
  id: string;
  label: string;
  aipCode: Optional<string>;
  mfoPpa: string;
  sourceOfFund: string;
  implementingOffice: string;
};

function makeEmptyForm(): PurchasingFormState {
  return {
    prNumber: "",
    purpose: "",
    supplier: "",
    address: "",
    tinNumber: "",
    purchaseOrderNumber: "",
    modeOfProcurementId: "",
    placeOfDelivery: "",
    dateOfDelivery: "",
    deliveryTerm: "",
    paymentTerm: "",
  };
}

function makeEditForm(item: PurchasingItemResponse): PurchasingFormState {
  return {
    prNumber: item.prNumber,
    purpose: item.purpose,
    supplier: item.supplier ?? "",
    address: item.address ?? "",
    tinNumber: item.tinNumber ?? "",
    purchaseOrderNumber: item.purchaseOrderNumber ?? "",
    modeOfProcurementId: item.modeOfProcurement?.id ?? "",
    placeOfDelivery: item.placeOfDelivery ?? "",
    dateOfDelivery: toDateInputValue(item.dateOfDelivery),
    deliveryTerm: item.deliveryTerm ?? "",
    paymentTerm: item.paymentTerm ?? "",
  };
}

function makeEmptyRequestItem(): RequestItemFormState {
  return {
    key: crypto.randomUUID(),
    unit: "",
    itemDescription: "",
    quantity: "",
    unitCost: "",
  };
}

function makeInitialRequestItems(item: Optional<PurchasingItemResponse>): RequestItemFormState[] {
  if (!item) {
    return [makeEmptyRequestItem()];
  }

  return [{
    key: crypto.randomUUID(),
    unit: item.unit,
    itemDescription: item.itemDescription,
    quantity: item.quantity,
    unitCost: item.unitCost,
  }];
}

function makeInitialSignatories(item: Optional<PurchasingItemResponse>): SignatoryFormState {
  if (!item) {
    return {
      headOfOfficeId: "",
      treasurerId: "",
      approverId: "",
    };
  }

  return {
    headOfOfficeId: item.headOfOffice.id,
    treasurerId: item.treasurer.id,
    approverId: item.approvedBy.id,
  };
}

function makeInitialAips(item: Optional<PurchasingItemResponse>): SelectedAip[] {
  if (!item) {
    return [];
  }

  return item.aip.map(entry => ({
    key: crypto.randomUUID(),
    id: entry.id,
    label: `${entry.aipCode} - ${entry.ppa}`,
    aipCode: entry.aipCode,
    mfoPpa: entry.ppa,
    sourceOfFund: entry.sourceOfFund ?? "",
    implementingOffice: entry.implementingOffice ?? "",
  }));
}

export function PurchasingFormDialog({ mode, open, onOpenChange, onSuccess, editItem }: PurchasingFormDialogProps) {
  const [form, setForm] = useState<PurchasingFormState>(() =>
    mode === "edit" && editItem ? makeEditForm(editItem) : makeEmptyForm(),
  );
  const [requestItems, setRequestItems] = useState<RequestItemFormState[]>(() => makeInitialRequestItems(editItem));
  const [signatories, setSignatories] = useState<SignatoryFormState>(() => makeInitialSignatories(editItem));
  const [selectedAips, setSelectedAips] = useState<SelectedAip[]>(() => makeInitialAips(editItem));
  const [submitting, setSubmitting] = useState(false);

  const { data: signatoryResponse, isLoading: signatoryLoading } = useSWR<
    BetterFetchResponse<PurchasingValidSignatoriesResponse, ApiResponseException>
  >(
    open ? "/api/forms/purchasing/valid/signatories" : null,
    $fetch,
  );

  const { data: procurementTypeResponse } = useSWR<
    BetterFetchResponse<ProcurementTypesListResponse, ApiResponseException>
  >(
    open ? "/api/management/data/procurement-types" : null,
    $fetch,
  );

  const procurementTypes = procurementTypeResponse?.data?.data ?? [];

  const signatoryData = signatoryResponse?.data?.data;
  const availableSignatoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const signer of signatoryData?.headOfOffice ?? []) ids.add(signer.id);
    for (const signer of signatoryData?.treasurer ?? []) ids.add(signer.id);
    for (const signer of signatoryData?.mayor ?? []) ids.add(signer.id);
    return ids;
  }, [signatoryData]);

  const itemFieldsDisabled = mode === "edit";

  const updateField = (key: keyof PurchasingFormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateRequestItemRow = (
    key: string,
    field: keyof Omit<RequestItemFormState, "key">,
    value: string,
  ) => {
    setRequestItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      return { ...item, [field]: value };
    }));
  };

  const addRequestItemRow = () => {
    setRequestItems(prev => [...prev, makeEmptyRequestItem()]);
  };

  const removeRequestItemRow = (key: string) => {
    setRequestItems(prev => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter(item => item.key !== key);
    });
  };

  const addAipRow = () => {
    setSelectedAips(prev => [
      ...prev,
      {
        key: crypto.randomUUID(),
        id: "",
        label: "",
        aipCode: null,
        mfoPpa: "",
        sourceOfFund: "",
        implementingOffice: "",
      },
    ]);
  };

  const updateAipRow = (key: string, selected: { id: string; label: string; aipCode: Optional<string>; mfoPpa: string; sourceOfFund: string; implementingOffice: string }) => {
    setSelectedAips(prev => prev.map(row => {
      if (row.key !== key) return row;

      return {
        ...row,
        id: selected.id,
        label: selected.label,
        aipCode: selected.aipCode,
        mfoPpa: selected.mfoPpa,
        sourceOfFund: selected.sourceOfFund,
        implementingOffice: selected.implementingOffice,
      };
    }));
  };

  const removeAipRow = (key: string) => {
    setSelectedAips(prev => prev.filter(row => row.key !== key));
  };

  const resetDialogState = () => {
    setForm(mode === "edit" && editItem ? makeEditForm(editItem) : makeEmptyForm());
    setRequestItems(makeInitialRequestItems(editItem));
    setSignatories(makeInitialSignatories(editItem));
    setSelectedAips(makeInitialAips(editItem));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const selectedAipPayload = selectedAips
      .filter(row => row.id)
      .map((row, idx) => ({ idx, id: row.id }));

    if (mode === "add") {
      const normalizedRequestItems = requestItems
        .map(item => ({
          unit: item.unit.trim(),
          description: item.itemDescription.trim(),
          quantity: item.quantity.trim(),
          unitCost: item.unitCost.trim(),
        }))
        .filter(item => item.unit || item.description || item.quantity || item.unitCost);

      if (!form.prNumber.trim()) {
        toast.warning("PR number is required");
        return;
      }

      if (!form.purpose.trim()) {
        toast.warning("Purpose is required");
        return;
      }

      if (normalizedRequestItems.length === 0) {
        toast.warning("Add at least one item");
        return;
      }

      const incompleteIndex = normalizedRequestItems.findIndex(item =>
        !item.unit || !item.description || !item.quantity || !item.unitCost,
      );
      if (incompleteIndex >= 0) {
        toast.warning(`Complete all item fields for row ${incompleteIndex + 1}`);
        return;
      }

      if (selectedAipPayload.length === 0) {
        toast.warning("Select at least one AIP link");
        return;
      }

      if (!signatories.headOfOfficeId || !signatories.treasurerId || !signatories.approverId) {
        toast.warning("Select all signatories");
        return;
      }

      setSubmitting(true);

      const result = await $fetch<unknown, ApiResponseException>("/api/forms/purchasing", {
        method: "POST",
        body: {
          prNumber: form.prNumber.trim(),
          purpose: form.purpose.trim(),
          items: normalizedRequestItems,
          aip: selectedAipPayload,
          signatories: {
            headOfOfficeId: signatories.headOfOfficeId,
            treasurerId: signatories.treasurerId,
            approverId: signatories.approverId,
          },
        },
      });

      setSubmitting(false);

      if (result.error) {
        toast.error("Purchase request was not created", {
          description: (result.error as ApiResponseException).message ?? "Please review the form and try again.",
        });
        return;
      }

      onSuccess();
      onOpenChange(false);
      resetDialogState();
      toast.success("Purchase request created");
      return;
    }

    if (!editItem) {
      toast.warning("Select a purchase request to update");
      return;
    }

    const payload: Record<string, unknown> = {
      aip: selectedAipPayload,
    };

    if (form.prNumber.trim()) payload.prNumber = form.prNumber.trim();
    if (form.purpose.trim()) payload.purpose = form.purpose.trim();
    if (form.supplier.trim()) payload.supplier = form.supplier.trim();
    if (form.address.trim()) payload.address = form.address.trim();
    if (form.tinNumber.trim()) payload.tinNumber = form.tinNumber.trim();
    if (form.purchaseOrderNumber.trim()) payload.purchaseOrderNumber = form.purchaseOrderNumber.trim();
    if (form.modeOfProcurementId.trim()) payload.modeOfProcurementId = form.modeOfProcurementId.trim();
    if (form.placeOfDelivery.trim()) payload.placeOfDelivery = form.placeOfDelivery.trim();
    if (form.dateOfDelivery.trim()) payload.dateOfDelivery = form.dateOfDelivery.trim();
    if (form.deliveryTerm.trim()) payload.deliveryTerm = form.deliveryTerm.trim();
    if (form.paymentTerm.trim()) payload.paymentTerm = form.paymentTerm.trim();

    setSubmitting(true);

    const result = await $fetch<unknown, ApiResponseException>(`/api/forms/purchasing/${editItem.id}`, {
      method: "PATCH",
      body: payload,
    });

    setSubmitting(false);

    if (result.error) {
      toast.error("Purchase request was not updated", {
        description: (result.error as ApiResponseException).message ?? "Please review the form and try again.",
      });
      return;
    }

    onSuccess();
    onOpenChange(false);
    resetDialogState();
    toast.success("Purchase request updated");
  };

  const exportPRToExcel = async () => {
    if (!editItem) {
      return;
    }

    const res = await fetch(`/api/forms/purchasing/export/pr?id=${editItem.id}`);
    if (!res.ok) {
      toast.error("PR export failed", {
        description: "Please refresh the request and try again.",
      });
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Purchase_Request_${editItem.prNumber || Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("PR workbook is ready");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Create Purchase Request" : "Edit Purchase Request"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Enter purchase request details and signatories."
              : "Update request and purchase-order fields for this selected item."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-12rem)] pr-2">
          <form id="purchasing-form" onSubmit={handleSubmit} className="grid gap-5 pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pr-number">
                  PR Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pr-number"
                  value={form.prNumber}
                  onChange={e => updateField("prNumber", e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="purpose">
                  Purpose <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="purpose"
                  value={form.purpose}
                  onChange={e => updateField("purpose", e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            <Separator />

            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Item Details</h3>
                {itemFieldsDisabled && (
                  <span className="text-xs text-muted-foreground">
                    Item fields are read-only in edit mode.
                  </span>
                )}
              </div>

              <div className="grid gap-3">
                {requestItems.map((row, index) => (
                  <div key={row.key} className="rounded-md border p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Item #{index + 1}</span>
                      {!itemFieldsDisabled && requestItems.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => removeRequestItemRow(row.key)}
                          disabled={submitting}
                          aria-label={`Remove item ${index + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor={`unit-${row.key}`}>Unit</Label>
                        <Input
                          id={`unit-${row.key}`}
                          value={row.unit}
                          onChange={e => updateRequestItemRow(row.key, "unit", e.target.value)}
                          disabled={submitting || itemFieldsDisabled}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`item-description-${row.key}`}>Item Description</Label>
                        <Input
                          id={`item-description-${row.key}`}
                          value={row.itemDescription}
                          onChange={e => updateRequestItemRow(row.key, "itemDescription", e.target.value)}
                          disabled={submitting || itemFieldsDisabled}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`quantity-${row.key}`}>Quantity</Label>
                        <Input
                          id={`quantity-${row.key}`}
                          value={row.quantity}
                          onChange={e => updateRequestItemRow(row.key, "quantity", e.target.value)}
                          disabled={submitting || itemFieldsDisabled}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`unit-cost-${row.key}`}>Unit Cost</Label>
                        <Input
                          id={`unit-cost-${row.key}`}
                          value={row.unitCost}
                          onChange={e => updateRequestItemRow(row.key, "unitCost", e.target.value)}
                          disabled={submitting || itemFieldsDisabled}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {!itemFieldsDisabled && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={addRequestItemRow}
                    disabled={submitting}
                  >
                    Add Item
                  </Button>
                )}
              </div>
            </div>

            {mode === "edit" && (
              <>
                <Separator />

                <div className="grid gap-4">
                  <h3 className="text-sm font-semibold">Purchase Order Fields</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="supplier">Supplier</Label>
                      <Input
                        id="supplier"
                        value={form.supplier}
                        onChange={e => updateField("supplier", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={form.address}
                        onChange={e => updateField("address", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="tin-number">TIN Number</Label>
                      <Input
                        id="tin-number"
                        value={form.tinNumber}
                        onChange={e => updateField("tinNumber", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="purchase-order-number">PO #</Label>
                      <Input
                        id="purchase-order-number"
                        value={form.purchaseOrderNumber}
                        onChange={e => updateField("purchaseOrderNumber", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="mode-of-procurement">Mode of Procurement (Optional)</Label>
                      <Select
                        value={form.modeOfProcurementId}
                        onValueChange={value => updateField("modeOfProcurementId", value === "__none__" ? "" : value)}
                        disabled={submitting || procurementTypes.length === 0}
                      >
                        <SelectTrigger id="mode-of-procurement">
                          <SelectValue placeholder={procurementTypes.length === 0 ? "No options loaded" : "Select a mode"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No mode of procurement</SelectItem>
                          {procurementTypes.map(option => (
                            <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {procurementTypes.length === 0 && (
                        <Input
                          placeholder="Paste modeOfProcurementId"
                          value={form.modeOfProcurementId}
                          onChange={e => updateField("modeOfProcurementId", e.target.value)}
                          disabled={submitting}
                        />
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="place-of-delivery">Place of Delivery</Label>
                      <Input
                        id="place-of-delivery"
                        value={form.placeOfDelivery}
                        onChange={e => updateField("placeOfDelivery", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="date-of-delivery">Date of Delivery</Label>
                      <Input
                        id="date-of-delivery"
                        type="date"
                        value={form.dateOfDelivery}
                        onChange={e => updateField("dateOfDelivery", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="delivery-term">Delivery Term</Label>
                      <Input
                        id="delivery-term"
                        value={form.deliveryTerm}
                        onChange={e => updateField("deliveryTerm", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="payment-term">Payment Term</Label>
                      <Input
                        id="payment-term"
                        value={form.paymentTerm}
                        onChange={e => updateField("paymentTerm", e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="grid gap-3">
              <h3 className="text-sm font-semibold">AIP Links</h3>
              {selectedAips.length === 0 && (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No linked AIP yet. Add at least one before saving.
                </div>
              )}
              {selectedAips.map(row => (
                <div key={row.key} className="flex items-start gap-2">
                  <div className="flex-1">
                    <LbacSearchCombobox
                      value={row.id
                        ? {
                          id: row.id,
                          label: row.label,
                          aipCode: row.aipCode,
                          mfoPpa: row.mfoPpa,
                          sourceOfFund: row.sourceOfFund,
                          implementingOffice: row.implementingOffice,
                        }
                        : null}
                      onChange={value => updateAipRow(row.key, value)}
                      disabled={submitting}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => removeAipRow(row.key)}
                    disabled={submitting}
                    aria-label="Remove AIP"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={addAipRow}
                disabled={submitting}
              >
                Add AIP
              </Button>
            </div>

            <Separator />

            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Signatories</h3>
                {mode === "edit" && (
                  <span className="text-xs text-muted-foreground">
                    Signatories are fixed after creation.
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label>Head of Office (Requested by)</Label>
                  <Select
                    value={signatories.headOfOfficeId}
                    onValueChange={value => setSignatories(prev => ({ ...prev, headOfOfficeId: value }))}
                    disabled={submitting || signatoryLoading || mode === "edit"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select head of office" />
                    </SelectTrigger>
                    <SelectContent>
                      {(signatoryData?.headOfOffice ?? []).map(signer => (
                        <SelectItem key={signer.id} value={signer.id}>{signer.name} - {signer.position}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Treasurer (Cash Availability)</Label>
                  <Select
                    value={signatories.treasurerId}
                    onValueChange={value => setSignatories(prev => ({ ...prev, treasurerId: value }))}
                    disabled={submitting || signatoryLoading || mode === "edit"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select treasurer" />
                    </SelectTrigger>
                    <SelectContent>
                      {(signatoryData?.treasurer ?? []).map(signer => (
                        <SelectItem key={signer.id} value={signer.id}>{signer.name} - {signer.position}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Mayor (Approved by)</Label>
                  <Select
                    value={signatories.approverId}
                    onValueChange={value => setSignatories(prev => ({ ...prev, approverId: value }))}
                    disabled={submitting || signatoryLoading || mode === "edit"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select mayor" />
                    </SelectTrigger>
                    <SelectContent>
                      {(signatoryData?.mayor ?? []).map(signer => (
                        <SelectItem key={signer.id} value={signer.id}>{signer.name} - {signer.position}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {mode === "edit" && (
                <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  Current signatories are shown from the selected row. The update API does not modify signatory assignments.
                </div>
              )}
              {mode === "add" && availableSignatoryIds.size === 0 && (
                <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  No valid signatories available for your role/office.
                </div>
              )}
            </div>
          </form>
        </ScrollArea>

        <DialogFooter>
          {mode === "edit" && editItem && (
            <Button type="button" variant="outline" onClick={exportPRToExcel} disabled={submitting}>
              <FileSpreadsheet className="size-4 mr-2" /> Export PR (.xlsx)
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button type="submit" form="purchasing-form" disabled={submitting}>
            {submitting
              ? "Saving..."
              : mode === "add"
                ? "Create Purchase Request"
                : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseOrderDialog({ open, onOpenChange, onSuccess, items }: PurchaseOrderDialogProps) {
  const selectedItems = items ?? [];
  const primaryItem = selectedItems[0];

  const [submitting, setSubmitting] = useState(false);
  const [supplier, setSupplier] = useState(() => primaryItem?.supplier ?? "");
  const [address, setAddress] = useState(() => primaryItem?.address ?? "");
  const [tinNumber, setTinNumber] = useState(() => primaryItem?.tinNumber ?? "");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState(() => primaryItem?.purchaseOrderNumber ?? "");
  const [modeOfProcurementId, setModeOfProcurementId] = useState(() => primaryItem?.modeOfProcurement?.id ?? "");
  const [placeOfDelivery, setPlaceOfDelivery] = useState(() => primaryItem?.placeOfDelivery ?? "");
  const [dateOfDelivery, setDateOfDelivery] = useState(() => toDateInputValue(primaryItem?.dateOfDelivery));
  const [deliveryTerm, setDeliveryTerm] = useState(() => primaryItem?.deliveryTerm ?? "");
  const [paymentTerm, setPaymentTerm] = useState(() => primaryItem?.paymentTerm ?? "");

  const { data: procurementTypeResponse } = useSWR<
    BetterFetchResponse<ProcurementTypesListResponse, ApiResponseException>
  >(
    open ? "/api/management/data/procurement-types" : null,
    $fetch,
  );

  const procurementTypes = procurementTypeResponse?.data?.data ?? [];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (selectedItems.length === 0) {
      toast.warning("Select at least one purchase request item first");
      return;
    }

    if (selectedItems.some(item => item.purchaseOrderNumber?.trim())) {
      toast.warning("Some selected items already have a purchase order");
      return;
    }

    if (!supplier.trim() || !address.trim() || !purchaseOrderNumber.trim()) {
      toast.warning("Supplier, address, and PO number are required");
      return;
    }

    setSubmitting(true);

    const result = await $fetch<unknown, ApiResponseException>(`/api/forms/purchasing/${selectedItems[0]!.id}/order`, {
      method: "POST",
      body: {
        supplier: supplier.trim(),
        address: address.trim(),
        tinNumber: tinNumber.trim() ? tinNumber.trim() : undefined,
        purchaseOrderNumber: purchaseOrderNumber.trim(),
        modeOfProcurementId: modeOfProcurementId.trim() ? modeOfProcurementId.trim() : undefined,
        placeOfDelivery: placeOfDelivery.trim() ? placeOfDelivery.trim() : undefined,
        dateOfDelivery: dateOfDelivery.trim() ? dateOfDelivery.trim() : undefined,
        deliveryTerm: deliveryTerm.trim() ? deliveryTerm.trim() : undefined,
        paymentTerm: paymentTerm.trim() ? paymentTerm.trim() : undefined,
        items: selectedItems.map(v => v.id),
      },
    });

    setSubmitting(false);

    if (result.error) {
      toast.error("Purchase order was not created", {
        description: (result.error as ApiResponseException).message ?? "Please review the form and try again.",
      });
      return;
    }

    onSuccess();
    onOpenChange(false);
    toast.success("Purchase order created");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
          <DialogDescription>
            {selectedItems.length === 0
              ? "Create a purchase order for selected purchase request items."
              : `Create a purchase order for ${selectedItems.length} selected item(s).`}
          </DialogDescription>
        </DialogHeader>

        <form id="purchase-order-form" onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="po-supplier">Supplier</Label>
            <Input id="po-supplier" value={supplier} onChange={e => setSupplier(e.target.value)} disabled={submitting} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="po-address">Address</Label>
            <Input id="po-address" value={address} onChange={e => setAddress(e.target.value)} disabled={submitting} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="po-tin">TIN Number</Label>
              <Input id="po-tin" value={tinNumber} onChange={e => setTinNumber(e.target.value)} disabled={submitting} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="po-number">PO #</Label>
              <Input id="po-number" value={purchaseOrderNumber} onChange={e => setPurchaseOrderNumber(e.target.value)} disabled={submitting} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="po-mode">Mode of Procurement (Optional)</Label>
            <Select
              value={modeOfProcurementId}
              onValueChange={value => setModeOfProcurementId(value === "__none__" ? "" : value)}
              disabled={submitting || procurementTypes.length === 0}
            >
              <SelectTrigger id="po-mode">
                <SelectValue placeholder={procurementTypes.length === 0 ? "No options loaded" : "Select a mode"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No mode of procurement</SelectItem>
                {procurementTypes.map(option => (
                  <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {procurementTypes.length === 0 && (
              <Input
                placeholder="Paste modeOfProcurementId"
                value={modeOfProcurementId}
                onChange={e => setModeOfProcurementId(e.target.value)}
                disabled={submitting}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="po-place">Place of Delivery</Label>
              <Input id="po-place" value={placeOfDelivery} onChange={e => setPlaceOfDelivery(e.target.value)} disabled={submitting} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="po-date">Date of Delivery</Label>
              <Input id="po-date" type="date" value={dateOfDelivery} onChange={e => setDateOfDelivery(e.target.value)} disabled={submitting} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="po-delivery-term">Delivery Term</Label>
              <Input id="po-delivery-term" value={deliveryTerm} onChange={e => setDeliveryTerm(e.target.value)} disabled={submitting} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="po-payment-term">Payment Term</Label>
              <Input id="po-payment-term" value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)} disabled={submitting} />
            </div>
          </div>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button type="submit" form="purchase-order-form" disabled={submitting}>
            {submitting ? "Saving..." : "Create Purchase Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LbacSearchCombobox({
  value,
  onChange,
  disabled,
}: {
  value: { id: string; label: string; aipCode: Optional<string>; mfoPpa: string; sourceOfFund: string; implementingOffice: string } | null;
  onChange: (value: { id: string; label: string; aipCode: Optional<string>; mfoPpa: string; sourceOfFund: string; implementingOffice: string }) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useSWR<BetterFetchResponse<LbacSearchResponse, ApiResponseException>>(
    !disabled && open && query.length >= 2
      ? `/api/lbac/search?query=${encodeURIComponent(query)}`
      : null,
    $fetch,
  );

  const results = data?.data?.data ?? [];

  return (
    <div className="relative flex flex-1 flex-col gap-1">
      <Input
        placeholder="Search AIP reference code or MFO/PPA..."
        value={open ? query : (value ? value.label : "")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQuery(e.target.value)}
        disabled={disabled}
      />

      {open && (
        <div className="absolute top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {isLoading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
          )}
          {!isLoading && query.length < 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Type at least 2 characters to search.</div>
          )}
          {!isLoading && query.length >= 2 && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found.</div>
          )}
          {!isLoading && query.length >= 2 && renderLbacNodes(results, 0, item => {
            const sourceOfFund = item.other?.expenseCode
              ? item.other.expenseCode.accountCode
                ? `${item.other.expenseCode.accountName} ${item.other.expenseCode.accountCode}`
                : item.other.expenseCode.accountName
              : "";
            onChange({
              id: item.id,
              label: `${item.aipRefCode?.aipReferenceCode ?? "N/A"} - ${item.mfoPpa}`,
              aipCode: item.aipRefCode?.aipReferenceCode ?? null,
              mfoPpa: item.mfoPpa,
              sourceOfFund,
              implementingOffice: item.aipRefCode?.implementingOffice ?? "",
            });
            setOpen(false);
            setQuery("");
          })}
        </div>
      )}
    </div>
  );
}

function renderLbacNodes(
  nodes: Array<LbacSearchGroupItem | LbacSearchResultItem>,
  depth: number,
  onSelect: (item: LbacSearchResultItem) => void,
): React.ReactNode {
  return nodes.map(node => {
    if (isLbacSearchGroup(node)) {
      return (
        <div key={node.id}>
          <div
            className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none"
            style={{ paddingLeft: `${12 + depth * 12}px` }}
          >
            {node.name}
          </div>
          {renderLbacNodes(node.children, depth + 1, onSelect)}
        </div>
      );
    }

    return (
      <button
        key={node.id}
        type="button"
        className="flex w-full flex-col items-start py-2 text-left text-sm hover:bg-accent"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        onMouseDown={() => onSelect(node)}
      >
        <span className="font-medium">{node.aipRefCode?.aipReferenceCode ?? "N/A"}</span>
        <span className="text-xs text-muted-foreground">{node.mfoPpa}</span>
      </button>
    );
  });
}

function toDateInputValue(value: Optional<string>): string {
  if (!value) {
    return "";
  }

  const fromDisplay = DateTime.fromFormat(value, "MM/dd/yyyy", { zone: "Asia/Manila" });
  if (fromDisplay.isValid) {
    return fromDisplay.toFormat("yyyy-MM-dd");
  }

  const fromIso = DateTime.fromISO(value, { zone: "Asia/Manila" });
  if (fromIso.isValid) {
    return fromIso.toFormat("yyyy-MM-dd");
  }

  return "";
}
