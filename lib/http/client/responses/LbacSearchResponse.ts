import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

export type LbacSearchResultItem = {
  id: string;
  mfoPpa: string;
  aipRefCode: {
    id: string;
    aipReferenceCode: string;
    description: string;
    implementingOffice: string | null;
  } | null;
  other: {
    expenseCode: {
      id: string;
      accountName: string;
      accountCode: string | null;
    } | null;
  };
};

export type LbacSearchGroupItem = {
  id: string;
  name: string;
  children: Array<LbacSearchGroupItem | LbacSearchResultItem>;
};

export type LbacSearchResponse = GenericOkResponse<LbacSearchGroupItem[]>;

export function isLbacSearchGroup(
  node: LbacSearchGroupItem | LbacSearchResultItem,
): node is LbacSearchGroupItem {
  return 'children' in node;
}
