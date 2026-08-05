import type {ReactNode} from 'react';

import type {PageColumnDef, PageColumnGroup} from '@/common/column-visibility';
import type {EsreItemResponse} from '@/lib/http/client/responses';

export const ESRE_PAGE_STORAGE_KEY = 'esre';

export type EsrePageColumnKey =
  | 'date'
  | 'checkNumber'
  | 'fundingSource'
  | 'dvOrPayrollNumber'
  | 'orsBursNumber'
  | 'expenseClass'
  | 'office'
  | 'expenseName'
  | 'accountCode'
  | 'payee'
  | 'natureOfPayment'
  | 'amount'
  | 'checkStatus'
  | 'remarks'
  | 'expenseType'
  | 'disbursed';

export type EsrePageColumnDef = PageColumnDef<EsrePageColumnKey> & {
  renderCell: (item: EsreItemResponse) => ReactNode;
};

export const ESRE_PAGE_COLUMNS: EsrePageColumnDef[] = [
  {
    key: 'date',
    label: 'Date',
    pinned: true,
    headerClassName: 'min-w-28',
    cellClassName: 'min-w-28',
    renderCell: (item) => formatDate(item.date),
  },
  {
    key: 'checkNumber',
    label: 'Check Number',
    headerClassName: 'min-w-36',
    cellClassName: 'min-w-36',
    renderCell: (item) => item.checkNumber ?? '—',
  },
  {
    key: 'fundingSource',
    label: 'Funding Source',
    headerClassName: 'min-w-44 whitespace-normal break-words',
    cellClassName: 'min-w-44 whitespace-normal break-words',
    renderCell: (item) => item.fundingSource.name,
  },
  {
    key: 'dvOrPayrollNumber',
    label: 'DV/Payroll No.',
    headerClassName: 'min-w-36',
    cellClassName: 'min-w-36',
    renderCell: (item) => item.dvOrPayrollNumber ?? '—',
  },
  {
    key: 'orsBursNumber',
    label: 'ORS/BURS No.',
    headerClassName: 'min-w-36',
    cellClassName: 'min-w-36',
    renderCell: (item) => item.obr?.requestNumber ?? '—',
  },
  {
    key: 'expenseClass',
    label: 'Expense Class',
    headerClassName: 'min-w-40 whitespace-normal break-words',
    cellClassName: 'min-w-40 whitespace-normal break-words',
    renderCell: (item) => item.obr?.expenseClass.subClassification ?? '—',
  },
  {
    key: 'office',
    label: 'Office',
    headerClassName: 'min-w-44 whitespace-normal break-words',
    cellClassName: 'min-w-44 whitespace-normal break-words',
    renderCell: (item) => item.obr?.office.name ?? '—',
  },
  {
    key: 'expenseName',
    label: 'Expense Name',
    headerClassName: 'w-[240px] min-w-[240px] max-w-[240px] whitespace-normal break-words',
    cellClassName: 'w-[240px] min-w-[240px] max-w-[240px] whitespace-normal break-words',
    renderCell: (item) => item.obr?.expenseClass.accountName ?? '—',
  },
  {
    key: 'accountCode',
    label: 'Account Code',
    headerClassName: 'min-w-36',
    cellClassName: 'min-w-36 font-mono',
    renderCell: (item) => item.obr?.expenseClass.accountCode ?? '—',
  },
  {
    key: 'payee',
    label: 'Payee',
    pinned: true,
    headerClassName: 'w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words',
    cellClassName: 'w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words',
    renderCell: (item) => item.payee,
  },
  {
    key: 'natureOfPayment',
    label: 'Nature of Payment',
    headerClassName: 'w-[260px] min-w-[260px] max-w-[260px] whitespace-normal break-words',
    cellClassName: 'w-[260px] min-w-[260px] max-w-[260px] whitespace-normal break-words',
    renderCell: (item) => item.natureOfPayment,
  },
  {
    key: 'amount',
    label: 'Amount',
    numeric: true,
    headerClassName: 'min-w-28 text-right',
    cellClassName: 'min-w-28 text-right font-mono',
    renderCell: (item) => item.amount,
  },
  {
    key: 'checkStatus',
    label: 'Check Status',
    headerClassName: 'min-w-32',
    cellClassName: 'min-w-32',
    renderCell: (item) => item.checkStatus ?? '—',
  },
  {
    key: 'remarks',
    label: 'Remarks',
    headerClassName: 'w-[260px] min-w-[260px] max-w-[260px] whitespace-normal break-words',
    cellClassName: 'w-[260px] min-w-[260px] max-w-[260px] whitespace-normal break-words',
    renderCell: (item) => item.remarks ?? '—',
  },
  {
    key: 'expenseType',
    label: 'Expense Type',
    headerClassName: 'min-w-40 whitespace-normal break-words',
    cellClassName: 'min-w-40 whitespace-normal break-words',
    renderCell: (item) => item.expenseType?.name ?? '—',
  },
  {
    key: 'disbursed',
    label: 'Disbursed',
    numeric: true,
    headerClassName: 'min-w-28 text-right',
    cellClassName: 'min-w-28 text-right font-mono',
    renderCell: (item) => item.disbursed,
  },
];

export const ESRE_PAGE_COLUMN_GROUPS: PageColumnGroup<EsrePageColumnKey>[] = [
  {group: 'Columns', columns: ESRE_PAGE_COLUMNS},
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
  });
}
