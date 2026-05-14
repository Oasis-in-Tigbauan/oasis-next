import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";

export type SaaobSearchEntry = {
  id: string;
  name: string;
  accountCode?: string | null;
  annualBudget: string;
};

export type SaaobSearchGroup = {
  id: string;
  name: string;
  children: Array<SaaobSearchGroup | SaaobSearchEntry>;
};

export type SaaobSearchResponse = GenericOkResponse<SaaobSearchGroup[]>;

export function isSaaobGroup(node: SaaobSearchGroup | SaaobSearchEntry): node is SaaobSearchGroup {
  return "children" in node;
}
