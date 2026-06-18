"use client";

import { useState, useCallback, useRef } from "react";
import { ClipboardPaste, FileSpreadsheet, FileText, PlusIcon, Table2, Trash2, Trash2Icon, Upload } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  UserResponse,
  ObrRequestSummaryListResponse,
  ObrRequestDetailResponse,
  ObrRequestDetail,
  ObrTemplatesResponse,
  ExpenseClassListResponse,
  OfficeCodeListResponse,
  ObrTemplateInfo,
} from "@/lib/http/client/responses";
import * as permissions from "@/lib/db/permissions";

import { Badge } from "@/components/ui/badge";
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
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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

// --- Local types for create form ---

type CreateFormItem = {
  _key: string;
  expenseCodeId: string;
  responsibilityCenterId: string;
  particulars: string;
  amount: string;
};

type CreateFormState = {
  requestNumber: string;
  payee: string;
  officeAddress: string;
  obrNumber: string;
  prNumber: string;
  withCheque: boolean;
  requestItems: CreateFormItem[];
};

type ItemError = {
  expenseCodeId?: string;
  responsibilityCenterId?: string;
  particulars?: string;
  amount?: string;
};

type CreateFormErrors = {
  requestNumber?: string;
  payee?: string;
  officeAddress?: string;
  requestItems?: string;
  items: ItemError[];
};

// --- Helpers ---

function makeEmptyItem(): CreateFormItem {
  return {
    _key: crypto.randomUUID(),
    expenseCodeId: "",
    responsibilityCenterId: "",
    particulars: "",
    amount: "",
  };
}

function makeEmptyForm(): CreateFormState {
  return {
    requestNumber: "",
    payee: "",
    officeAddress: "",
    obrNumber: "",
    prNumber: "",
    withCheque: true,
    requestItems: [makeEmptyItem()],
  };
}

function makeEmptyErrors(): CreateFormErrors {
  return { items: [] };
}

function normalizeLookup(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeAmount(value: string): string {
  return value.replace(/[,\s₱]/g, "").trim();
}

function splitPastedRow(row: string): string[] {
  if (row.includes("\t")) {
    return row.split("\t").map(cell => cell.trim());
  }

  return row.split(",").map(cell => cell.trim());
}

function isBulkImportHeader(columns: string[]): boolean {
  const normalized = columns.map(normalizeLookup).join(" ");
  return normalized.includes("expense") && normalized.includes("amount");
}

// --- ApprovalStatusBadge ---

function ApprovalStatusBadge({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
        Approved
      </Badge>
    );
  }
  if (status === "binned") {
    return <Badge variant="destructive">Binned</Badge>;
  }
  if (status === "mixed") {
    return <Badge variant="secondary">Mixed</Badge>;
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
      Pending
    </Badge>
  );
}

function formatTemplateDate(isoString: string): string {
  return new Date(isoString).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.details === "string") return record.details;
  if (typeof record.message === "string") return record.message;
  return fallback;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
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

function ObrExportDialog({
  open,
  onOpenChange,
  requestId,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  detail: ObrRequestDetail;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<ObrTemplatesResponse, ApiResponseException>
  >(open ? "/api/obr/templates" : null, $fetch);

  const templates = data?.data?.data;

  const handleExport = useCallback(async (format: "xlsx" | "pdf" = "xlsx") => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch(`/api/obr/requests/${requestId}/export${format === "pdf" ? "?format=pdf" : ""}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setExportError(extractErrorMessage(payload, "Export failed. Please try again."));
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
      const filename = filenameMatch?.[1] ?? `obr-request-${requestId}.${format}`;

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch {
      setExportError("An unexpected error occurred. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [onOpenChange, requestId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-none w-[96vw] h-[88vh] p-0 gap-0 overflow-hidden">
        <div className="flex-none px-6 pt-6 pb-3 border-b">
          <DialogHeader>
            <DialogTitle>Export OBR Request</DialogTitle>
            <DialogDescription>
              Preview the request export and optionally customize the header template.
            </DialogDescription>
          </DialogHeader>
        </div>

        <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-3">
          <TabsList className="flex-none mb-3 self-start">
            <TabsTrigger value="preview" className="text-xs gap-1.5">
              <Table2 className="size-3" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="header" className="text-xs gap-1.5">
              Header
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
            <ScrollArea className="h-0 min-h-0 flex-1">
              <div className="flex flex-col gap-4 pb-4 pr-4">
                <div className="rounded-lg border p-4">
                  <Typography variant="small" className="font-semibold mb-2">
                    Request {detail.requestNumber}
                  </Typography>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Payee:</span> {detail.payee}</div>
                    <div><span className="text-muted-foreground">Office:</span> {detail.officeAddress}</div>
                    <div><span className="text-muted-foreground">OBR No.:</span> {detail.obrNumber ?? "—"}</div>
                    <div><span className="text-muted-foreground">PR No.:</span> {detail.prNumber ?? "—"}</div>
                  </div>
                </div>

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>RC</TableHead>
                        <TableHead>Particulars</TableHead>
                        <TableHead>FPP (Expense Name)</TableHead>
                        <TableHead>Account Code</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.requestItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>{item.responsibilityCenter.name}</TableCell>
                          <TableCell>{item.particulars}</TableCell>
                          <TableCell>{item.expenseCode.name}</TableCell>
                          <TableCell>{item.expenseCode.accountCode ?? "-"}</TableCell>
                          <TableCell className="text-right">
                            {Number.parseFloat(item.amount).toLocaleString("en-PH", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="header" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
            {isLoading ? (
              <Loading />
            ) : error || data?.error ? (
              <Typography variant="small" className="text-destructive">
                Failed to load templates. Please close and try again.
              </Typography>
            ) : (
              <HeaderTemplateSection
                template={templates?.header ?? null}
                apiPath="/api/obr/templates"
                onMutate={() => void mutate()}
              />
            )}
          </TabsContent>
        </Tabs>

        <div className="flex-none px-6 py-4 border-t flex flex-col gap-2">
          {exportError && (
            <Typography variant="small" className="text-destructive">
              {exportError}
            </Typography>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={exporting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button variant="outline" disabled={exporting} onClick={() => void handleExport("xlsx")}>
              <FileSpreadsheet className="size-3.5" />
              {exporting ? "Exporting..." : "Export XLSX"}
            </Button>
            <Button disabled={exporting} onClick={() => void handleExport("pdf")}>
              <FileText className="size-3.5" />
              {exporting ? "Exporting..." : "Export PDF"}
            </Button>
          </DialogFooter>
        </div>
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
  } = useSWR<BetterFetchResponse<ObrRequestSummaryListResponse, ApiResponseException>>(
    "/api/obr/requests",
    $fetch,
  );

  const { data: userData } = useSWR<BetterFetchResponse<UserResponse, ApiResponseException>>(
    "/api/account/me",
    $fetch,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const permissionSet = new Set(userData?.data?.data?.office?.role?.permissions ?? []);
  const canCreate = permissionSet.has(permissions.OBR_REQUEST_CREATE);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  }, []);

  if (listLoading) {
    return <Loading />;
  }

  if (listError || listData?.error || !listData?.data?.data) {
    return <DeadHamster />;
  }

  const requests = listData.data.data;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      {canCreate && (
        <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon className="size-3" />
            New
          </Button>
        </div>
      )}

      <div className="border rounded-lg p-2">
        {requests.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No OBR requests found.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead>Request No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Office Address</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req, index) => (
                  <TableRow
                    key={req.id}
                    className={`cursor-pointer select-none ${
                      index % 2 === 1 ? "bg-muted hover:bg-muted/50" : ""
                    }`}
                    onClick={() => handleRowClick(req.id)}
                  >
                    <TableCell className="font-medium">{req.requestNumber}</TableCell>
                    <TableCell className="capitalize">{req.type}</TableCell>
                    <TableCell>{req.payee}</TableCell>
                    <TableCell>{req.officeAddress}</TableCell>
                    <TableCell className="text-right">{req.requestItemsCount}</TableCell>
                    <TableCell>
                      <ApprovalStatusBadge status={req.approvalStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedId && (
        <RequestDetailDialog
          id={selectedId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}

      {canCreate && (
        <CreateRequestDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={() => mutateList()}
        />
      )}
    </div>
  );
}

// --- Request Detail Dialog ---

function RequestDetailDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, error, isLoading } = useSWR<
    BetterFetchResponse<ObrRequestDetailResponse, ApiResponseException>
  >(open ? `/api/obr/requests/${id}` : null, $fetch);
  const [exportOpen, setExportOpen] = useState(false);

  const detail = data?.data?.data;

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    return `₱${num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateStr: Optional<string>) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[75%] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>OBR Request Details</DialogTitle>
          <DialogDescription>
            Read-only view of the obligation request and its approval status.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto pr-2">
          {isLoading && <Loading />}
          {(error || data?.error || (!isLoading && !detail)) && <DeadHamster />}
          {detail && (
            <div className="flex flex-col gap-6 pb-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Request Number
                  </Typography>
                  <Typography variant="p" className="not-first:mt-0">{detail.requestNumber}</Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Type
                  </Typography>
                  <Typography variant="p" className="capitalize not-first:mt-0">
                    {detail.type}
                  </Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Payee
                  </Typography>
                  <Typography variant="p" className="not-first:mt-0">{detail.payee}</Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Office Address
                  </Typography>
                  <Typography variant="p" className="not-first:mt-0">{detail.officeAddress}</Typography>
                </div>
                {detail.obrNumber && (
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      OBR Number
                    </Typography>
                    <Typography variant="p" className="not-first:mt-0">{detail.obrNumber}</Typography>
                  </div>
                )}
                {detail.prNumber && (
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      PR Number
                    </Typography>
                    <Typography variant="p" className="not-first:mt-0">{detail.prNumber}</Typography>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Originating Office
                  </Typography>
                  <Typography variant="p" className="not-first:mt-0">{detail.office.name}</Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Published By
                  </Typography>
                  <Typography variant="p" className="not-first:mt-0">{detail.publisher.name}</Typography>
                </div>
              </div>

              <Separator />

              <div>
                <Typography variant="h4" className="mb-3">
                  Request Items
                </Typography>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Particulars</TableHead>
                      <TableHead>Expense Code</TableHead>
                      <TableHead>Account Code</TableHead>
                      <TableHead>Responsibility Center</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.requestItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.particulars}</TableCell>
                        <TableCell>{item.expenseCode.name}</TableCell>
                        <TableCell>{item.expenseCode.accountCode ?? "—"}</TableCell>
                        <TableCell>{item.responsibilityCenter.name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatAmount(item.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator />

              <div>
                <Typography variant="h4" className="mb-3">
                  Approvers
                </Typography>
                <div className="flex flex-col gap-3">
                  {detail.approvers.map((approver, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between rounded-md border p-3"
                    >
                      <div className="flex flex-col gap-1">
                        <Typography variant="small" className="font-medium">
                          {approver.position.name}
                        </Typography>
                        {approver.signer ? (
                          <Typography variant="small" className="text-muted-foreground">
                            Signed by: {approver.signer.name}
                          </Typography>
                        ) : (
                          <Typography variant="small" className="text-muted-foreground">
                            Not yet signed
                          </Typography>
                        )}
                        {approver.reason && (
                          <Typography variant="small" className="text-muted-foreground">
                            Reason: {approver.reason}
                          </Typography>
                        )}
                        {approver.signedAt && (
                          <Typography variant="small" className="text-muted-foreground">
                            {formatDate(approver.signedAt)}
                          </Typography>
                        )}
                      </div>
                      <ApprovalStatusBadge status={approver.status} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="pt-4 justify-between">
          <Button
            variant="secondary"
            onClick={() => setExportOpen(true)}
            disabled={!detail}
          >
            Export
          </Button>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>

      {detail && (
        <ObrExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          requestId={id}
          detail={detail}
        />
      )}
    </Dialog>
  );
}

// --- Create Request Dialog ---

function CreateRequestDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { data: expenseData } = useSWR<
    BetterFetchResponse<ExpenseClassListResponse, ApiResponseException>
  >(open ? "/api/management/data/expense-classes" : null, $fetch);

  const { data: officeCodeData } = useSWR<
    BetterFetchResponse<OfficeCodeListResponse, ApiResponseException>
  >(open ? "/api/management/data/office-codes" : null, $fetch);

  const expenseClassList = expenseData?.data?.data ?? [];
  const officeCodeList = officeCodeData?.data?.data ?? [];

  const [form, setForm] = useState<CreateFormState>(makeEmptyForm);
  const [errors, setErrors] = useState<CreateFormErrors>(makeEmptyErrors);
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState("");
  const [bulkImportMessage, setBulkImportMessage] = useState<string | null>(null);
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);

  const markDirty = () => setIsDirty(true);

  const updateHeader = (
    key: keyof Omit<CreateFormState, "requestItems">,
    value: string,
  ) => {
    setForm(prev => ({ ...prev, [key]: value }));
    markDirty();
  };

  const updateItem = (
    index: number,
    key: keyof Omit<CreateFormItem, "_key">,
    value: string,
  ) => {
    setForm(prev => {
      const items = [...prev.requestItems];
      items[index] = { ...items[index], [key]: value };
      return { ...prev, requestItems: items };
    });
    markDirty();
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      requestItems: [...prev.requestItems, makeEmptyItem()],
    }));
    markDirty();
  };

  const removeItem = (index: number) => {
    setForm(prev => ({
      ...prev,
      requestItems: prev.requestItems.filter((_, i) => i !== index),
    }));
    markDirty();
  };

  const importPastedItems = () => {
    setBulkImportMessage(null);
    setBulkImportError(null);

    const lines = bulkPasteText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setBulkImportError("Paste at least one item row before importing.");
      return;
    }

    const expenseByLookup = new Map<string, string>();
    for (const expense of expenseClassList) {
      const values = [
        expense.id,
        expense.accountCode ?? "",
        expense.accountName,
        expense.fpp ?? "",
        expense.accountCode ? `${expense.accountName} ${expense.accountCode}` : "",
      ];
      for (const value of values) {
        const key = normalizeLookup(value);
        if (key) expenseByLookup.set(key, expense.id);
      }
    }

    const officeByLookup = new Map<string, string>();
    for (const officeCode of officeCodeList) {
      const values = [
        officeCode.id,
        officeCode.aa,
        officeCode.code ?? "",
        officeCode.office.name,
        `${officeCode.aa} ${officeCode.office.name}`,
      ];
      for (const value of values) {
        const key = normalizeLookup(value);
        if (key) officeByLookup.set(key, officeCode.id);
      }
    }

    const imported: CreateFormItem[] = [];
    const skipped: string[] = [];

    lines.forEach((line, lineIndex) => {
      const columns = splitPastedRow(line);
      if (lineIndex === 0 && isBulkImportHeader(columns)) return;

      if (columns.length < 4) {
        skipped.push(`Line ${lineIndex + 1}: expected at least 4 columns.`);
        return;
      }

      const expenseText = columns[0] ?? "";
      const responsibilityText = columns.length >= 5 ? columns[2] ?? "" : columns[1] ?? "";
      const particulars = columns.length >= 5
        ? columns.slice(3, -1).join(" ").trim()
        : columns.slice(2, -1).join(" ").trim();
      const amount = normalizeAmount(columns[columns.length - 1] ?? "");

      const expenseCodeId = expenseByLookup.get(normalizeLookup(expenseText));
      const responsibilityCenterId = officeByLookup.get(normalizeLookup(responsibilityText));
      const parsedAmount = Number.parseFloat(amount);

      if (!expenseCodeId) {
        skipped.push(`Line ${lineIndex + 1}: expense not found (${expenseText}).`);
        return;
      }
      if (!responsibilityCenterId) {
        skipped.push(`Line ${lineIndex + 1}: responsibility center not found (${responsibilityText}).`);
        return;
      }
      if (!particulars) {
        skipped.push(`Line ${lineIndex + 1}: particulars is empty.`);
        return;
      }
      if (!amount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        skipped.push(`Line ${lineIndex + 1}: amount is invalid.`);
        return;
      }

      imported.push({
        _key: crypto.randomUUID(),
        expenseCodeId,
        responsibilityCenterId,
        particulars,
        amount,
      });
    });

    if (imported.length === 0) {
      setBulkImportError(skipped.slice(0, 5).join(" "));
      return;
    }

    setForm(prev => ({
      ...prev,
      requestItems:
        prev.requestItems.length === 1
        && !prev.requestItems[0].expenseCodeId
        && !prev.requestItems[0].responsibilityCenterId
        && !prev.requestItems[0].particulars
        && !prev.requestItems[0].amount
          ? imported
          : [...prev.requestItems, ...imported],
    }));
    setErrors(makeEmptyErrors());
    setBulkPasteText("");
    setBulkImportMessage(
      skipped.length > 0
        ? `Imported ${imported.length} item(s). Skipped ${skipped.length}: ${skipped.slice(0, 3).join(" ")}`
        : `Imported ${imported.length} item(s).`,
    );
    markDirty();
  };

  const validate = (): boolean => {
    const errs: CreateFormErrors = { items: [] };
    let valid = true;

    if (!form.requestNumber.trim()) {
      errs.requestNumber = "Request number is required.";
      valid = false;
    }
    if (!form.payee.trim()) {
      errs.payee = "Payee is required.";
      valid = false;
    }
    if (!form.officeAddress.trim()) {
      errs.officeAddress = "Office address is required.";
      valid = false;
    }
    if (form.requestItems.length === 0) {
      errs.requestItems = "At least one request item is required.";
      valid = false;
    }

    for (const item of form.requestItems) {
      const itemErr: ItemError = {};
      if (!item.expenseCodeId) {
        itemErr.expenseCodeId = "Expense code is required.";
        valid = false;
      }
      if (!item.responsibilityCenterId) {
        itemErr.responsibilityCenterId = "Responsibility center is required.";
        valid = false;
      }
      if (!item.particulars.trim()) {
        itemErr.particulars = "Particulars is required.";
        valid = false;
      }
      const parsedAmount = parseFloat(item.amount);
      if (!item.amount.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
        itemErr.amount = "A valid positive amount is required.";
        valid = false;
      }
      errs.items.push(itemErr);
    }

    setErrors(errs);
    return valid;
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      if (!confirm("You have unsaved changes. Close anyway?")) return;
    }
    if (!nextOpen) {
      setForm(makeEmptyForm());
      setErrors(makeEmptyErrors());
      setBulkPasteText("");
      setBulkImportMessage(null);
      setBulkImportError(null);
      setIsDirty(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    const payload = {
      requestNumber: form.requestNumber.trim(),
      payee: form.payee.trim(),
      officeAddress: form.officeAddress.trim(),
      ...(form.obrNumber.trim() ? { obrNumber: form.obrNumber.trim() } : {}),
      ...(form.prNumber.trim() ? { prNumber: form.prNumber.trim() } : {}),
      withCheque: form.withCheque,
      requestItems: form.requestItems.map(item => ({
        expenseCodeId: item.expenseCodeId,
        responsibilityCenterId: item.responsibilityCenterId,
        particulars: item.particulars.trim(),
        amount: item.amount.trim(),
      })),
    };

    const res = await $fetch<unknown, ApiResponseException>("/api/obr/requests", {
      method: "POST",
      body: payload,
    });

    setSubmitting(false);

    if (res.error) {
      alert(res.error.message ?? "Failed to create OBR request. Please try again.");
      return;
    }

    setForm(makeEmptyForm());
    setErrors(makeEmptyErrors());
    setIsDirty(false);
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="min-w-[75%] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create OBR Request</DialogTitle>
          <DialogDescription>
            Fill in the obligation request details and add line items.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto pr-2">
          <form
            id="create-obr-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-6 pb-2"
          >
            <div className="grid grid-cols-2 gap-4">
              <FieldGroup>
                <Field>
                  <Label htmlFor="requestNumber">
                    Request Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="requestNumber"
                    value={form.requestNumber}
                    onInput={e => updateHeader("requestNumber", e.currentTarget.value)}
                    placeholder="Enter request number"
                    aria-invalid={!!errors.requestNumber}
                  />
                  {errors.requestNumber && (
                    <p className="text-sm text-destructive">{errors.requestNumber}</p>
                  )}
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <Label htmlFor="payee">
                    Payee <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="payee"
                    value={form.payee}
                    onInput={e => updateHeader("payee", e.currentTarget.value)}
                    placeholder="Enter payee name"
                    aria-invalid={!!errors.payee}
                  />
                  {errors.payee && (
                    <p className="text-sm text-destructive">{errors.payee}</p>
                  )}
                </Field>
              </FieldGroup>

              <FieldGroup className="col-span-2">
                <Field>
                  <Label htmlFor="officeAddress">
                    Office Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="officeAddress"
                    value={form.officeAddress}
                    onInput={e => updateHeader("officeAddress", e.currentTarget.value)}
                    placeholder="Enter office address"
                    aria-invalid={!!errors.officeAddress}
                  />
                  {errors.officeAddress && (
                    <p className="text-sm text-destructive">{errors.officeAddress}</p>
                  )}
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <Label htmlFor="obrNumber">
                    OBR Number{" "}
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="obrNumber"
                    value={form.obrNumber}
                    onInput={e => updateHeader("obrNumber", e.currentTarget.value)}
                    placeholder="Enter OBR number"
                  />
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <Label htmlFor="prNumber">
                    PR Number{" "}
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="prNumber"
                    value={form.prNumber}
                    onInput={e => updateHeader("prNumber", e.currentTarget.value)}
                    placeholder="Enter PR number"
                  />
                </Field>
              </FieldGroup>

              <FieldGroup className="col-span-2">
                <Field>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="withCheque"
                      checked={form.withCheque}
                      onCheckedChange={checked => {
                        setForm(prev => ({ ...prev, withCheque: checked === true }));
                        markDirty();
                      }}
                    />
                    <Label htmlFor="withCheque">
                      With cheque (create disbursement vouchers for each item)
                    </Label>
                  </div>
                </Field>
              </FieldGroup>
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Typography variant="h4">Request Items</Typography>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <PlusIcon className="size-4 mr-1" />
                  Add Item
                </Button>
              </div>

              {errors.requestItems && (
                <p className="text-sm text-destructive">{errors.requestItems}</p>
              )}

              <div className="rounded-md border bg-muted/30 p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="font-medium">
                      Paste Items from Spreadsheet
                    </Typography>
                    <Typography variant="small" className="text-muted-foreground">
                      Columns: Expense Code or Name, Responsibility Center, Particulars, Amount. A header row is allowed.
                    </Typography>
                  </div>
                  <Textarea
                    value={bulkPasteText}
                    onChange={e => {
                      setBulkPasteText(e.currentTarget.value);
                      setBulkImportMessage(null);
                      setBulkImportError(null);
                    }}
                    placeholder={"Expense Code\tResponsibility Center\tParticulars\tAmount\nOffice Supplies\t101 - Mayor's Office\tBond paper A4\t1500.00"}
                    className="min-h-28 bg-background font-mono text-xs"
                    disabled={submitting}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-xs">
                      {bulkImportMessage && (
                        <p className="text-muted-foreground">{bulkImportMessage}</p>
                      )}
                      {bulkImportError && (
                        <p className="text-destructive">{bulkImportError}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={importPastedItems}
                      disabled={submitting || expenseClassList.length === 0 || officeCodeList.length === 0}
                    >
                      <ClipboardPaste className="size-4 mr-1" />
                      Import Pasted Rows
                    </Button>
                  </div>
                </div>
              </div>

              {form.requestItems.map((item, idx) => {
                const itemErr = errors.items[idx] ?? {};
                const selectedExpense = expenseClassList.find(
                  ec => ec.id === item.expenseCodeId,
                );
                return (
                  <div
                    key={item._key}
                    className="rounded-md border p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <Typography variant="small" className="font-medium">
                        Item {idx + 1}
                      </Typography>
                      {form.requestItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => removeItem(idx)}
                          aria-label="Remove item"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <FieldGroup>
                        <Field>
                          <Label>
                            Expense Code <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={item.expenseCodeId}
                            onValueChange={val => updateItem(idx, "expenseCodeId", val)}
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-invalid={!!itemErr.expenseCodeId}
                            >
                              <SelectValue placeholder="Select expense code" />
                            </SelectTrigger>
                            <SelectContent>
                              {expenseClassList.map(ec => (
                                <SelectItem key={ec.id} value={ec.id}>
                                  {ec.accountName}
                                  {ec.accountCode ? ` (${ec.accountCode})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {itemErr.expenseCodeId && (
                            <p className="text-sm text-destructive">
                              {itemErr.expenseCodeId}
                            </p>
                          )}
                        </Field>
                      </FieldGroup>

                      <FieldGroup>
                        <Field>
                          <Label>Account Code</Label>
                          <Input
                            value={selectedExpense?.accountCode ?? "—"}
                            readOnly
                            className="bg-muted cursor-not-allowed"
                          />
                        </Field>
                      </FieldGroup>

                      <FieldGroup className="col-span-2">
                        <Field>
                          <Label>
                            Responsibility Center{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={item.responsibilityCenterId}
                            onValueChange={val =>
                              updateItem(idx, "responsibilityCenterId", val)
                            }
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-invalid={!!itemErr.responsibilityCenterId}
                            >
                              <SelectValue placeholder="Select responsibility center" />
                            </SelectTrigger>
                            <SelectContent>
                              {officeCodeList.map(oc => (
                                <SelectItem key={oc.id} value={oc.id}>
                                  {oc.aa} — {oc.office.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {itemErr.responsibilityCenterId && (
                            <p className="text-sm text-destructive">
                              {itemErr.responsibilityCenterId}
                            </p>
                          )}
                        </Field>
                      </FieldGroup>

                      <FieldGroup className="col-span-2">
                        <Field>
                          <Label>
                            Particulars <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            value={item.particulars}
                            onInput={e =>
                              updateItem(idx, "particulars", e.currentTarget.value)
                            }
                            placeholder="Describe the item"
                            aria-invalid={!!itemErr.particulars}
                          />
                          {itemErr.particulars && (
                            <p className="text-sm text-destructive">
                              {itemErr.particulars}
                            </p>
                          )}
                        </Field>
                      </FieldGroup>

                      <FieldGroup>
                        <Field>
                          <Label>
                            Amount <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            value={item.amount}
                            onInput={e =>
                              updateItem(idx, "amount", e.currentTarget.value)
                            }
                            placeholder="0.00"
                            inputMode="decimal"
                            aria-invalid={!!itemErr.amount}
                          />
                          {itemErr.amount && (
                            <p className="text-sm text-destructive">{itemErr.amount}</p>
                          )}
                        </Field>
                      </FieldGroup>
                    </div>
                  </div>
                );
              })}
            </div>
          </form>
        </ScrollArea>

        <DialogFooter className="pt-4">
          <Button
            variant="outline"
            type="button"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="create-obr-form" disabled={submitting}>
            {submitting ? "Creating..." : "Create Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
