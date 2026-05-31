"use client";

import { useEffect, useRef, useState } from "react";
import { FileImage, Loader2, Printer, X } from "lucide-react";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  TravelOrderItemResponse,
  TravelOrderUserItemResponse,
  TravelOrderUserListResponse,
} from "@/lib/http/client/responses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TravelOrderPrintDialogProps = {
  item: TravelOrderItemResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TravelOrderPrintDialog({
  item,
  open,
  onOpenChange,
}: TravelOrderPrintDialogProps) {
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [footerFile, setFooterFile] = useState<File | null>(null);
  const [approvedByName, setApprovedByName] = useState("");
  const [approvedByPosition, setApprovedByPosition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [approverResults, setApproverResults] = useState<TravelOrderUserItemResponse[]>([]);
  const [approverDropdownOpen, setApproverDropdownOpen] = useState(false);
  const [isSearchingApprover, setIsSearchingApprover] = useState(false);
  const approverSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const approverDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (approverSearchTimeout.current) clearTimeout(approverSearchTimeout.current);

    const trimmed = approvedByName.trim();
    if (!trimmed) return;

    approverSearchTimeout.current = setTimeout(async () => {
      setIsSearchingApprover(true);
      try {
        const res = await $fetch<TravelOrderUserListResponse, ApiResponseException>(
          `/api/forms/travel-order/users?q=${encodeURIComponent(trimmed)}`,
        );
        if (!res.error && res.data?.data) {
          setApproverResults(res.data.data);
          setApproverDropdownOpen(res.data.data.length > 0);
        }
      }
      finally {
        setIsSearchingApprover(false);
      }
    }, 300);

    return () => {
      if (approverSearchTimeout.current) clearTimeout(approverSearchTimeout.current);
    };
  }, [approvedByName]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (approverDropdownRef.current && !approverDropdownRef.current.contains(e.target as Node)) {
        setApproverDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function resetLocalState() {
    setHeaderFile(null);
    setFooterFile(null);
    setApprovedByName("");
    setApprovedByPosition("");
    setApproverResults([]);
    setApproverDropdownOpen(false);
    setError(null);
    setIsExporting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetLocalState();
    onOpenChange(nextOpen);
  }

  async function handleExport() {
    if (!item) return;

    setError(null);
    setIsExporting(true);
    try {
      const formData = new FormData();
      if (headerFile) formData.append("header", headerFile);
      if (footerFile) formData.append("footer", footerFile);
      if (approvedByName.trim()) formData.append("approvedByName", approvedByName.trim());
      if (approvedByPosition.trim()) formData.append("approvedByPosition", approvedByPosition.trim());

      const response = await fetch(`/api/forms/travel-order/${item.id}/export`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const message = await _readErrorMessage(response);
        setError(message);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = _filenameFromDisposition(
        response.headers.get("Content-Disposition"),
        `travel-order-${item.refNumber}.pdf`,
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      handleOpenChange(false);
    }
    catch {
      setError("Unable to export the travel order PDF. Please try again.");
    }
    finally {
      setIsExporting(false);
    }
  }

  function selectApprover(user: TravelOrderUserItemResponse) {
    setApprovedByName(user.name);
    setApprovedByPosition(user.officePosition.name);
    setApproverDropdownOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Export Travel Order</DialogTitle>
          <DialogDescription>
            Generate a printable PDF for REF #{item?.refNumber ?? ""}. Header and footer
            images are used only for this export and are not saved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="space-y-1">
              <Label htmlFor="travel-order-approved-by" className="text-sm font-semibold">
                Approved by
              </Label>
              <p className="text-xs text-muted-foreground">
                Type an approving official or search and select a user. Blank fields use the default approving official.
              </p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="relative sm:col-span-2" ref={approverDropdownRef}>
                <Input
                  id="travel-order-approved-by"
                  className="h-8 text-xs"
                  placeholder={item?.approvedBy?.name ?? "Search or type approving official..."}
                  value={approvedByName}
                  onChange={event => {
                    setApprovedByName(event.target.value);
                    if (!event.target.value) {
                      setApproverResults([]);
                      setApproverDropdownOpen(false);
                    }
                  }}
                  autoComplete="off"
                />
                {isSearchingApprover && (
                  <div className="absolute right-2 top-2 text-xs text-muted-foreground">
                    Searching...
                  </div>
                )}
                {approverDropdownOpen && approverResults.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
                    {approverResults.map(user => (
                      <button
                        key={user.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                        onMouseDown={event => {
                          event.preventDefault();
                          selectApprover(user);
                        }}
                      >
                        <div className="font-medium">{user.name}</div>
                        <div className="text-muted-foreground">
                          {user.office.name} - {user.officePosition.name}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                className="h-8 text-xs sm:col-span-2"
                placeholder={item?.approvedBy?.position.name ?? "Approving official position"}
                value={approvedByPosition}
                onChange={event => setApprovedByPosition(event.target.value)}
              />
            </div>
          </div>

          <ImageUploadField
            id="travel-order-header"
            label="Letterhead image"
            description="Optional PNG or JPEG shown across the top of the PDF."
            file={headerFile}
            onFileChange={setHeaderFile}
          />
          <ImageUploadField
            id="travel-order-footer"
            label="Footer image"
            description="Optional PNG or JPEG shown at the bottom of the PDF."
            file={footerFile}
            onFileChange={setFooterFile}
          />

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={!item || isExporting} onClick={handleExport}>
            {isExporting ? (
              <>
                <Loader2 className="animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Printer />
                Export PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ImageUploadFieldProps = {
  id: string;
  label: string;
  description: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
};

function ImageUploadField({
  id,
  label,
  description,
  file,
  onFileChange,
}: ImageUploadFieldProps) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor={id} className="text-sm font-semibold">
            <FileImage className="size-4 text-muted-foreground" />
            {label}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {file && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={() => onFileChange(null)}
          >
            <X />
          </Button>
        )}
      </div>
      <Input
        key={file ? "selected" : "empty"}
        id={id}
        className="mt-3"
        type="file"
        accept="image/png,image/jpeg"
        onChange={event => onFileChange(event.currentTarget.files?.[0] ?? null)}
      />
      {file && (
        <p className="mt-2 truncate text-xs text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{file.name}</span>
        </p>
      )}
    </div>
  );
}

async function _readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.message === "string") return payload.message;
    if (typeof payload?.error?.message === "string") return payload.error.message;
  }
  catch {
    // Fall back to the generic message below when the response is not JSON.
  }
  return "Unable to export the travel order PDF. Please try again.";
}

function _filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename="?(?<filename>[^";]+)"?/i.exec(disposition);
  return match?.groups?.filename ?? fallback;
}
