"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Pencil, X, Check, Trash2, Upload, FileSpreadsheet, FileText } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  FundTypesListResponse,
  ObrDisbursementVoucherListResponse,
  ObrDisbursementVoucherItem,
  ObrTemplateInfo,
  ObrTemplatesResponse,
} from "@/lib/http/client/responses";

import { Badge } from "@/components/ui/badge";
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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";

type TaxType = "vat-g" | "vat-s" | "nvat-g" | "nvat-s";
type DisbursementStatus = "PREPARATION" | "PROCESSING" | "ON HOLD" | "FOR RELEASE" | "PAID";

const NONE = "__none__";

const TAX_TYPE_LABELS: Record<TaxType, string> = {
  "vat-g": "VAT - Goods",
  "vat-s": "VAT - Services",
  "nvat-g": "Non-VAT - Goods",
  "nvat-s": "Non-VAT - Services",
};

const STATUS_OPTIONS: DisbursementStatus[] = [
  "PREPARATION",
  "PROCESSING",
  "ON HOLD",
  "FOR RELEASE",
  "PAID",
];

function formatCurrency(value: string | null): string {
  if (!value) return "—";

  const trimmed = value.trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(trimmed)) return "—";

  const isNegative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[-+]/, "");
  const [rawInt, rawFrac = ""] = unsigned.split(".");

  const normalizedInt = rawInt.replace(/^0+(?=\d)/, "") || "0";
  const paddedFrac = (rawFrac + "000").slice(0, 3);
  const centPart = paddedFrac.slice(0, 2);
  const roundingDigit = Number.parseInt(paddedFrac[2] ?? "0", 10);

  let cents = BigInt(`${normalizedInt}${centPart}`);
  if (roundingDigit >= 5) {
    cents += 1n;
  }

  const centsStr = cents.toString().padStart(3, "0");
  const integerPart = centsStr.slice(0, -2) || "0";
  const fractionalPart = centsStr.slice(-2);
  const intWithGrouping = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const roundedIsZero = cents === 0n;
  const sign = isNegative && !roundedIsZero ? "-" : "";

  return `${sign}${intWithGrouping}.${fractionalPart}`;
}

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

function displayText(value: string | null | undefined): string {
  return value ?? "—";
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  if (status === "PAID") {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
        {status}
      </Badge>
    );
  }
  if (status === "ON HOLD") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const data = payload as {
    error?: { message?: unknown };
    message?: unknown;
    errors?: unknown;
  };

  if (typeof data.error?.message === "string") return data.error.message;
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.errors)) {
    const msgs = data.errors.filter((v): v is string => typeof v === "string");
    if (msgs.length > 0) return msgs.join(" ");
  }

  return fallback;
}

function formatTemplateDate(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Taipei",
  }).format(new Date(iso));
}

function HeaderTemplateSection({
  template,
  apiPath,
  onMutate,
}: {
  template: ObrTemplateInfo | null;
  apiPath: string;
  onMutate: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const runUpload = useCallback(async (file: File, mode: "upload" | "replace") => {
    setSubmitting(true);
    setActionError(null);

    const formData = new FormData();
    formData.set("type", "header");
    formData.set("file", file);

    try {
      const response = await fetch(apiPath, {
        method: mode === "upload" ? "POST" : "PATCH",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(extractErrorMessage(payload, `Failed to ${mode} template.`));
        return;
      }

      onMutate();
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [apiPath, onMutate]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void runUpload(file, template ? "replace" : "upload");
  }, [runUpload, template]);

  const handleRemove = useCallback(async () => {
    setSubmitting(true);
    setActionError(null);

    try {
      const response = await fetch(apiPath, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "header" }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(extractErrorMessage(payload, "Failed to remove template."));
        return;
      }

      onMutate();
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [apiPath, onMutate]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Typography variant="small" className="font-semibold">Header Template</Typography>
          {template ? (
            <Typography variant="small" className="text-muted-foreground">
              Last updated {formatTemplateDate(template.updatedAt)}
            </Typography>
          ) : (
            <Typography variant="small" className="text-muted-foreground">Not uploaded</Typography>
          )}
        </div>
        <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        disabled={submitting}
        onChange={handleFileChange}
      />

      <div className="flex flex-wrap items-center gap-2">
        {!template ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={submitting}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3" />
            Upload
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3" />
              Replace
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              disabled={submitting}
              onClick={() => void handleRemove()}
            >
              <Trash2 className="size-3" />
              Remove
            </Button>
          </>
        )}
      </div>

      <Typography variant="small" className="text-muted-foreground">
        Excel (.xlsx) files only.
      </Typography>

      {actionError && (
        <Typography variant="small" className="text-destructive">{actionError}</Typography>
      )}
    </div>
  );
}

// --- Detail / Edit Dialog ---

type DetailDialogProps = {
  voucher: ObrDisbursementVoucherItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onDeleted: () => void;
};

function DetailDialog({ voucher, open, onOpenChange, onSaved, onDeleted }: DetailDialogProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  const [vatableAmount, setVatableAmount] = useState("");
  const [taxType, setTaxType] = useState<string>(NONE);
  const [fundTypeId, setFundTypeId] = useState<string>(NONE);
  const [status, setStatus] = useState<string>(NONE);

  const { data: fundTypesData } = useSWR<BetterFetchResponse<FundTypesListResponse, ApiResponseException>>(
    editing ? "/api/management/data/fund-types" : null,
    $fetch,
  );

  const {
    data: templatesData,
    error: templatesError,
    isLoading: templatesLoading,
    mutate: mutateTemplates,
  } = useSWR<BetterFetchResponse<ObrTemplatesResponse, ApiResponseException>>(
    open ? "/api/obr/disbursements/templates" : null,
    $fetch,
  );

  const fundTypes = fundTypesData?.data?.data ?? [];
  const templates = templatesData?.data?.data;

  const startEditing = useCallback(() => {
    if (!voucher) return;
    setActiveTab("details");
    setVatableAmount(voucher.vatableAmount ?? "");
    setTaxType(voucher.taxType ?? NONE);
    setFundTypeId(voucher.fundType?.id ?? NONE);
    setStatus(voucher.status ?? NONE);
    setSaveError(null);
    setEditing(true);
  }, [voucher]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!voucher) return;
    setSaving(true);
    setSaveError(null);

    const payload: Record<string, string> = {};
    if (vatableAmount.trim() !== "") payload.vatableAmount = vatableAmount.trim();
    if (taxType !== NONE) payload.taxType = taxType;
    if (fundTypeId !== NONE) payload.fundTypeId = fundTypeId;
    if (status !== NONE) payload.status = status;

    try {
      const res = await fetch(`/api/obr/disbursements/${voucher.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSaveError(json.error?.message ?? json.message ?? "Failed to save changes.");
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setSaveError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }, [voucher, vatableAmount, taxType, fundTypeId, status, onSaved]);

  const handleDelete = useCallback(async () => {
    if (!voucher) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/obr/disbursements/${voucher.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setDeleteError(json.error?.message ?? json.message ?? "Failed to delete.");
        setConfirmingDelete(false);
        return;
      }
      onDeleted();
      onOpenChange(false);
    } catch {
      setDeleteError("An unexpected error occurred.");
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }, [voucher, onDeleted, onOpenChange]);

  const handleExport = useCallback(async (format: "xlsx" | "pdf" = "xlsx") => {
    if (!voucher) return;
    setExporting(true);
    setExportError(null);

    try {
      const response = await fetch(`/api/obr/disbursements/${voucher.id}/export${format === "pdf" ? "?format=pdf" : ""}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setExportError(extractErrorMessage(payload, "Export failed. Please try again."));
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
      const filename = filenameMatch?.[1] ?? `disbursement-voucher-${voucher.id}.${format}`;

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("An unexpected error occurred. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [voucher]);

  const handleClose = useCallback((o: boolean) => {
    if (!o) {
      setEditing(false);
      setSaveError(null);
      setConfirmingDelete(false);
      setDeleteError(null);
      setExportError(null);
      setActiveTab("details");
    }
    onOpenChange(o);
  }, [onOpenChange]);

  if (!voucher) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="min-w-[75%]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <div>
              <DialogTitle>DV #{voucher.disbursementVoucherNumber}</DialogTitle>
              <DialogDescription>{formatDate(voucher.createdAt)}</DialogDescription>
            </div>
            {!editing && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={startEditing}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { setConfirmingDelete(true); setDeleteError(null); }}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsList className="mb-3 self-start">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="template" disabled={editing}>Template</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-0 min-h-0 flex-1 overflow-y-scroll overflow-x-hidden data-[state=inactive]:hidden">
            <ScrollArea className="max-h-[60vh] pr-1">
              <div className="flex flex-col gap-4 pb-2">
                {/* General */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field>
                    <Label>Payee</Label>
                    <Input readOnly value={voucher.payee} />
                  </Field>
                  <Field>
                    <Label>Address</Label>
                    <Input readOnly value={voucher.address} />
                  </Field>
                  <Field className="md:col-span-2">
                    <Label>Particulars</Label>
                    <Input readOnly value={voucher.particulars} />
                  </Field>
                  <Field>
                    <Label>PR #</Label>
                    <Input readOnly value={voucher.prNumber ?? "—"} />
                  </Field>
                </div>

                <Separator />

                {/* Amounts */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <Field>
                    <Label>Gross Amount</Label>
                    <Input readOnly value={formatCurrency(voucher.grossAmount)} />
                  </Field>
                  <Field>
                    <Label>Vatable Amount</Label>
                    {editing ? (
                      <Input
                        value={vatableAmount}
                        onChange={e => setVatableAmount(e.target.value)}
                        placeholder="e.g. 1234.56"
                      />
                    ) : (
                      <Input readOnly value={formatCurrency(voucher.vatableAmount)} />
                    )}
                  </Field>
                  <Field>
                    <Label>Tax Type</Label>
                    {editing ? (
                      <Select value={taxType} onValueChange={setTaxType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select tax type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>None</SelectItem>
                          {(["vat-g", "vat-s", "nvat-g", "nvat-s"] as TaxType[]).map(t => (
                            <SelectItem key={t} value={t}>{TAX_TYPE_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input readOnly value={voucher.taxType ? (TAX_TYPE_LABELS[voucher.taxType as TaxType] ?? voucher.taxType) : "—"} />
                    )}
                  </Field>
                </div>

                {/* Tax Breakdown */}
                <div>
                  <Typography variant="muted" className="text-xs uppercase font-semibold mb-2">Tax Breakdown</Typography>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <Field>
                      <Label>Tax</Label>
                      <Input readOnly value={formatCurrency(voucher.taxBreakdown.tax)} />
                    </Field>
                    <Field>
                      <Label>VAT (5%)</Label>
                      <Input readOnly value={formatCurrency(voucher.taxBreakdown.vat5)} />
                    </Field>
                    <Field>
                      <Label>PT (3%)</Label>
                      <Input readOnly value={formatCurrency(voucher.taxBreakdown.pt3)} />
                    </Field>
                    <Field>
                      <Label>EWT (2%)</Label>
                      <Input readOnly value={formatCurrency(voucher.taxBreakdown.ewt2)} />
                    </Field>
                    <Field>
                      <Label>EWT (1%)</Label>
                      <Input readOnly value={formatCurrency(voucher.taxBreakdown.ewt1)} />
                    </Field>
                    <Field>
                      <Label>Net Amount</Label>
                      <Input readOnly value={formatCurrency(voucher.taxBreakdown.netAmount)} />
                    </Field>
                  </div>
                </div>

                <Separator />

                {/* Fund / RC / Status */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <Field>
                    <Label>Fund</Label>
                    {editing ? (
                      <Select value={fundTypeId} onValueChange={setFundTypeId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select fund type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>None</SelectItem>
                          {fundTypes.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input readOnly value={voucher.fundType?.name ?? "—"} />
                    )}
                  </Field>
                  <Field>
                    <Label>RC</Label>
                    <Input readOnly value={voucher.responsibilityCenter.aa} />
                  </Field>
                  <Field>
                    <Label>Status</Label>
                    {editing ? (
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>None</SelectItem>
                          {STATUS_OPTIONS.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input readOnly value={voucher.status ?? "—"} />
                    )}
                  </Field>
                </div>

                <Separator />

                {/* Signers */}
                <div>
                  <Typography variant="muted" className="text-xs uppercase font-semibold mb-2">Signers</Typography>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field>
                      <Label>Head of Office</Label>
                      <Input readOnly value={displayText(voucher.signers.headOfOffice.name)} />
                    </Field>
                    <Field>
                      <Label>Position</Label>
                      <Input readOnly value={displayText(voucher.signers.headOfOffice.position)} />
                    </Field>
                    <Field>
                      <Label>Payment Approved By</Label>
                      <Input readOnly value={displayText(voucher.signers.mayor.name)} />
                    </Field>
                    <Field>
                      <Label>Position</Label>
                      <Input readOnly value={displayText(voucher.signers.mayor.position)} />
                    </Field>
                    <Field>
                      <Label>Accountant</Label>
                      <Input readOnly value={displayText(voucher.signers.accountant.name)} />
                    </Field>
                    <Field>
                      <Label>Position</Label>
                      <Input readOnly value={displayText(voucher.signers.accountant.position)} />
                    </Field>
                    <Field>
                      <Label>Treasurer</Label>
                      <Input readOnly value={displayText(voucher.signers.treasurer.name)} />
                    </Field>
                    <Field>
                      <Label>Position</Label>
                      <Input readOnly value={displayText(voucher.signers.treasurer.position)} />
                    </Field>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="template" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
            {templatesLoading ? (
              <Loading />
            ) : templatesError || templatesData?.error ? (
              <Typography variant="small" className="text-destructive">
                Failed to load templates. Please close and try again.
              </Typography>
            ) : (
              <HeaderTemplateSection
                template={templates?.header ?? null}
                apiPath="/api/obr/disbursements/templates"
                onMutate={() => void mutateTemplates()}
              />
            )}
          </TabsContent>
        </Tabs>

        {!editing && exportError && (
          <p className="text-sm text-destructive">{exportError}</p>
        )}

        {editing && (
          <>
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                <X className="size-4 mr-1" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Check className="size-4 mr-1" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </>
        )}

        {!editing && confirmingDelete && (
          <>
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
            <DialogFooter className="gap-2">
              <p className="text-sm text-muted-foreground mr-auto self-center">
                Delete this disbursement voucher? The linked OBR item will be unlinked.
              </p>
              <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="size-4 mr-1" />
                {deleting ? "Deleting..." : "Confirm Delete"}
              </Button>
            </DialogFooter>
          </>
        )}

        {!editing && !confirmingDelete && (
          <DialogFooter className="justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void handleExport("xlsx")} disabled={exporting}>
                <FileSpreadsheet className="size-4 mr-1" />
                {exporting ? "Exporting..." : "Export XLSX"}
              </Button>
              <Button onClick={() => void handleExport("pdf")} disabled={exporting}>
                <FileText className="size-4 mr-1" />
                {exporting ? "Exporting..." : "Export PDF"}
              </Button>
            </div>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Page ---

export default function Page() {
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<BetterFetchResponse<ObrDisbursementVoucherListResponse, ApiResponseException>>(
    "/api/obr/disbursements",
    $fetch,
  );

  const [selectedVoucher, setSelectedVoucher] = useState<ObrDisbursementVoucherItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const vouchers = useMemo(() => listData?.data?.data ?? [], [listData]);

  const handleRowClick = useCallback((v: ObrDisbursementVoucherItem) => {
    setSelectedVoucher(v);
    setDetailOpen(true);
  }, []);

  const handleSaved = useCallback(() => {
    mutateList();
  }, [mutateList]);

  const handleDeleted = useCallback(() => {
    mutateList();
  }, [mutateList]);

  if (listLoading) return <Loading />;
  if (listError || listData?.error || !listData?.data?.data) return <DeadHamster />;

  return (
    <div className="relative flex flex-col p-4">
      <div className="border rounded-lg p-2">
        {vouchers.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No disbursement vouchers have been created yet.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm min-w-max [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="whitespace-nowrap">DV #</TableHead>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead className="whitespace-nowrap">Fund</TableHead>
                  <TableHead className="whitespace-nowrap">Payee</TableHead>
                  <TableHead className="whitespace-nowrap">Address</TableHead>
                  <TableHead className="whitespace-nowrap">Particulars</TableHead>
                  <TableHead className="whitespace-nowrap">Gross Amount</TableHead>
                  <TableHead className="whitespace-nowrap">Vatable Amount</TableHead>
                  <TableHead className="whitespace-nowrap">Tax Type</TableHead>
                  <TableHead className="whitespace-nowrap">Tax</TableHead>
                  <TableHead className="whitespace-nowrap">VAT (5%)</TableHead>
                  <TableHead className="whitespace-nowrap">PT (3%)</TableHead>
                  <TableHead className="whitespace-nowrap">EWT (2%)</TableHead>
                  <TableHead className="whitespace-nowrap">EWT (1%)</TableHead>
                  <TableHead className="whitespace-nowrap">Net Amount</TableHead>
                  <TableHead className="whitespace-nowrap">RC</TableHead>
                  <TableHead className="whitespace-nowrap">Head of Office</TableHead>
                  <TableHead className="whitespace-nowrap">Position</TableHead>
                  <TableHead className="whitespace-nowrap">Payment Approved By</TableHead>
                  <TableHead className="whitespace-nowrap">Position</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">PR #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.map((v, index) => (
                  <TableRow
                    key={v.id}
                    className={`cursor-pointer select-none ${
                      index % 2 === 1 ? "bg-muted hover:bg-muted/50" : ""
                    }`}
                    onClick={() => handleRowClick(v)}
                  >
                    <TableCell className="font-medium whitespace-nowrap">{v.disbursementVoucherNumber}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(v.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{v.fundType?.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{v.payee}</TableCell>
                    <TableCell className="whitespace-nowrap">{v.address}</TableCell>
                    <TableCell className="whitespace-nowrap max-w-48 truncate">{v.particulars}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(v.grossAmount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(v.vatableAmount)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {v.taxType ? (TAX_TYPE_LABELS[v.taxType as TaxType] ?? v.taxType) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(v.taxBreakdown.tax)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(v.taxBreakdown.vat5)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(v.taxBreakdown.pt3)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(v.taxBreakdown.ewt2)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(v.taxBreakdown.ewt1)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(v.taxBreakdown.netAmount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{v.responsibilityCenter.aa}</TableCell>
                    <TableCell className="whitespace-nowrap">{displayText(v.signers.headOfOffice.name)}</TableCell>
                    <TableCell className="whitespace-nowrap">{displayText(v.signers.headOfOffice.position)}</TableCell>
                    <TableCell className="whitespace-nowrap">{displayText(v.signers.mayor.name)}</TableCell>
                    <TableCell className="whitespace-nowrap">{displayText(v.signers.mayor.position)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusBadge status={v.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{v.prNumber ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <DetailDialog
        voucher={selectedVoucher}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
