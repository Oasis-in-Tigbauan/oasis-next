import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export interface SaaobTemplateInfo {
  id: string;
  templateType: "header" | "footer";
  createdAt: string;
  updatedAt: string;
}

export type SaaobTemplatesPayload = {
  header: SaaobTemplateInfo | null;
  footer: SaaobTemplateInfo | null;
};

export type SaaobTemplatesResponse = GenericOkResponse<SaaobTemplatesPayload>;
