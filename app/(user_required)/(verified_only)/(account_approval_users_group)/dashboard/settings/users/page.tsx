"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  type TableMeta,
  type RowData,
  useReactTable,
} from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  AccountsListResponse,
  ApiResponseException,
  BanResponse,
  BetterFetchResponse,
} from "@/lib/http/client/responses";
import type { User } from "@/lib/accounts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DeadHamster from "@/components/dead-hamster";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Loading from "@/components/loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Typography from "@/components/typography";
import { useState } from "react";

const columns: ColumnDef<User>[] = [
  {
    accessorKey: "fullName",
    header: "Full Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "office.name",
    header: "Office",
  },
  {
    accessorKey: "office.role.name",
    header: "Role",
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => getStatusBadge(row.original),
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row, table }) => {
      return(
        <UserActions
          user={row.original}
          mutateFn={table.options.meta?.mutateUserFn || ((i, u) => { })}
        />
      );
    },
  },
];

export default function UsersPage() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<AccountsListResponse, ApiResponseException>>(
    "/api/management/credentials/users",
    $fetch,
  );

  const handleMutateFn = (id: string, user: User) => {
    if (data?.data && Array.isArray(data.data.data)) {
      mutate({
        data: {
          ok: true,
          data: data.data.data.map(x => {
            if (x.id === id) {
              return user;
            }

            return x;
          }),
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  if (isLoading) {
    return (<Loading />);
  }

  if (error || data?.error) {
    return (<DeadHamster />);
  }

  return (
    <div className="p-4 pt-0 w-full">
      <Typography variant="h3" className="mb-4">Users</Typography>
      <UserDataTable columns={columns} data={data?.data?.data || []} mutateUserFn={handleMutateFn} />
    </div>
  );
}

function UserDataTable({ columns, data, mutateUserFn }: UserDataTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),

    meta: {
      mutateUserFn: (id: string, user: User) => {
        mutateUserFn(id, user);
      },
    },
  });

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {
            table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {
                  headerGroup.headers.map(header => {
                    return (
                      <TableHead key={header.id}>
                        {
                          header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())
                        }
                      </TableHead>
                    );
                  })
                }
              </TableRow>
            ))
          }
        </TableHeader>
        <TableBody>
          {
            table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {
                    row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id}>
                        {
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        }
                      </TableCell>
                    ))
                  }
                </TableRow>
              ))
            ) : (
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No Results.
              </TableCell>
            )
          }
        </TableBody>
      </Table>
    </div>
  );
}

function getStatusBadge(user: User) {
  if (user.banned) {
    return (
      <Badge
        variant="outline"
        className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 border-0"
      >
        Banned
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="bg-green-500/15 text-green-700 hover:bg-green-500/25 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 border-0"
    >
      Active
    </Badge>
  );
}

function UserActions({ user, mutateFn }: { user: User, mutateFn: (id: string, user: User) => void }) {
  const [isTogglingBan, setIsTogglingBan] = useState(false);

  const toggleBan = async () => {
    setIsTogglingBan(true);

    const { data, error } = await $fetch<BanResponse, ApiResponseException>("/api/management/credentials/users/" + user.id + "/ban", {
      method: "POST",
    });
    if (error || !data.data) {
      alert("Failed to toggle ban. Try again later.");
      setIsTogglingBan(false);

      return;
    }

    mutateFn(data.data.id, data.data);
    setIsTogglingBan(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={isTogglingBan} className="text-destructive" onClick={toggleBan}>
          {
            user.banned ? `Unban ${user.fullName}` : `Ban ${user.fullName}`
          }
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    mutateUserFn: (id: string, user: User) => void;
  }
}

interface UserDataTableProps {
  columns: ColumnDef<User>[];
  data: User[];
  mutateUserFn: (id: string, data: User) => void;
}
