"use client";

import { useCallback, useRef, useState } from "react";
import { DateTime } from "luxon";
import { FileSpreadsheet, Trash2, Upload } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  LbacTemplateInfo,
  LbacTemplatesResponse,
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
import { Separator } from "@/components/ui/separator";
import Typography from "@/components/typography";
import Loading from "@/components/loading";

type TemplateType = "header" | "footer";

function formatTemplateDate(isoString: string): string {
  return DateTime.fromISO(isoString, { zone: "utc" })
    .setZone("Asia/Manila")
    .toFormat("MMMM d, yyyy 'at' h:mm a");
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.details === "string") return record.details;
  if (typeof record.message === "string") return record.message;
  return fallback;
}

function TemplateSection({
  label,
  type,
  template,
  apiPath,
  onMutate,
}: {
  label: string;
  type: TemplateType;
  template: LbacTemplateInfo | null;
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
    formData.set("type", type);
    formData.set("file", file);

    try {
      const response = await fetch(apiPath, {
        method: mode === "upload" ? "POST" : "PATCH",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(extractErrorMessage(payload, `Failed to ${mode} ${type} template.`));
        return;
      }

      onMutate();
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [apiPath, onMutate, type]);

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
        body: JSON.stringify({ type }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(extractErrorMessage(payload, `Failed to remove ${type} template.`));
        return;
      }

      onMutate();
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [apiPath, onMutate, type]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Typography variant="small" className="font-semibold">{label}</Typography>
          {template ? (
            <Typography variant="small" className="text-muted-foreground">
              Last updated {formatTemplateDate(template.updatedAt)}
            </Typography>
          ) : (
            <Typography variant="small" className="text-muted-foreground">
              Not uploaded
            </Typography>
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

export function ManageTemplatesDialog({
  open,
  onOpenChange,
  apiPath,
  description = "Upload or replace Excel templates used for LBAC report headers and footers.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiPath: string;
  description?: string;
}) {
  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<LbacTemplatesResponse, ApiResponseException>
  >(open ? apiPath : null, $fetch);

  const templates = data?.data?.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Headers/Footers</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Loading />
        ) : error || data?.error ? (
          <Typography variant="small" className="text-destructive">
            Failed to load templates. Please close and try again.
          </Typography>
        ) : (
          <div className="flex flex-col gap-4">
            <TemplateSection
              label="Header"
              type="header"
              template={templates?.header ?? null}
              apiPath={apiPath}
              onMutate={() => void mutate()}
            />
            <Separator />
            <TemplateSection
              label="Footer"
              type="footer"
              template={templates?.footer ?? null}
              apiPath={apiPath}
              onMutate={() => void mutate()}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
