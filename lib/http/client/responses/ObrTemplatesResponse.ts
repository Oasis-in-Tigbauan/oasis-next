import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export interface ObrTemplateInfo {
  id: string;
  templateType: "header" | "footer";
  createdAt: string;
  updatedAt: string;
}

export type ObrTemplatesPayload = {
  header: ObrTemplateInfo | null;
  footer: ObrTemplateInfo | null;
};

export type ObrTemplatesResponse = GenericOkResponse<ObrTemplatesPayload>;
