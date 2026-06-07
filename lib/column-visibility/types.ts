export type PageColumnDef<K extends string = string> = {
  key: K;
  label: string;
  pinned?: boolean;
  numeric?: boolean;
  headerClassName?: string;
  cellClassName?: string;
};

export type PageColumnGroup<K extends string = string> = {
  group: string;
  columns: ReadonlyArray<PageColumnDef<K>>;
};
