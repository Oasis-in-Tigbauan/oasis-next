import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export interface LbacTemplateInfo {
  id: string;
  templateType: 'header' | 'footer';
  createdAt: string;
  updatedAt: string;
}

export type LbacTemplatesPayload = {
  header: LbacTemplateInfo | null;
  footer: LbacTemplateInfo | null;
};

export type LbacTemplatesResponse = GenericOkResponse<LbacTemplatesPayload>;
