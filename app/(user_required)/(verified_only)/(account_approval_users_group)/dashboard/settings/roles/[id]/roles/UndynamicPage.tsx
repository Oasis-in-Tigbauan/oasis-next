"use client";

import { type SubmitEvent, useMemo, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  OfficeResponse,
  OfficeSingleResponseWithRoleExtendedInfo,
  PermissionDefinitionResponse,
  RoleDefinitionResponse,
} from "@/lib/http/client/responses";
import type { Permissions } from "@/lib/db/permissions";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import DeadHamster from "@/components/dead-hamster";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import Loading from "@/components/loading";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Typography from "@/components/typography";

export default function UndynamicPage({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<OfficeSingleResponseWithRoleExtendedInfo, ApiResponseException>>(
    `/api/management/offices/${id}`, $fetch);

  if (isLoading) {
    return (<Loading />);
  }

  if (data?.error || error) {
    return (<DeadHamster />);
  }

  const handleOnOfficeNameMutate = (name: string) => {
    if (data?.data && data.data.data) {
      mutate({
        data: {
          ok: true,
          data: {
            ...data.data.data,
            name,
          },
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  const handleCreateRoleMutate = (role: OfficeSingleResponseWithRoleExtendedInfo["data"]["roles"][0]) => {
    if (data?.data && data.data.data) {
      mutate({
        data: {
          ok: true,
          data: {
            ...data.data.data,
            roles: [
              ...data.data.data.roles,
              role,
            ],
          },
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  const handleUpdateRoleMutate = (role: OfficeSingleResponseWithRoleExtendedInfo["data"]["roles"][0]) => {
    if (data?.data && data.data.data) {
      mutate({
        data: {
          ok: true,
          data: {
            ...data.data.data,
            roles: [
              ...(data.data.data.roles || []).filter(r => r.id !== role.id),
              role,
            ],
          },
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  const result = data!.data.data;
  return (
    <div className="p-4 pt-0 w-full">
      <Typography variant="h3" className="mb-6 w-full pb-2 border-b-2 border-b-gray-200">
        Editing Office: {result.name}
      </Typography>
      <OfficeSectionEditor data={result} onMutate={handleOnOfficeNameMutate} />
      <Typography variant="h3" className="w-full pb-2">
        Roles
      </Typography>
      <Table>
        <TableCaption>
          Loaded total {(data?.data?.data?.roles || []).length} roles under this office.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Role Name</TableHead>
            <TableHead>Users</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {
            (data?.data?.data?.roles || []).map(r => (
              <UpdateRoleSelection
                key={r.id}
                roleId={r.id}
                name={r.name}
                userCount={r.userCount}
                permissions={r.permissions as Permissions[]}
                id={id}
                mutate={handleUpdateRoleMutate}
              />
            ))
          }
          <CreateRoleSection id={id} mutate={handleCreateRoleMutate} />
        </TableBody>
      </Table>
    </div>
  );
}

function OfficeSectionEditor({ data, onMutate }: { data: OfficeSingleResponseWithRoleExtendedInfo["data"], onMutate: (name: string) => void }) {
  const [officeName, setOfficeName] = useState<string>(data.name);

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const result = await $fetch<OfficeResponse, ApiResponseException>(
      `/api/management/offices/${data.id}`,
      {
        method: "PATCH",
        body: {
          name: officeName,
        },
      });
    if (result.data?.ok) {
      onMutate(result.data.data.name);

      alert("Updated office successfully.");
      return;
    }

    alert("Failed to update office. Try again later.");
  };

  return (
    <form className="w-full mb-6" onSubmit={handleSubmit}>
      <FieldLabel htmlFor="office-name" className="mb-2">Office Name</FieldLabel>
      <Field orientation="horizontal" className="mb-2">
        <Input
          id="office-name"
          type="text"
          value={officeName}
          onInput={e => setOfficeName(e.currentTarget.value)}
          className="w-full"
        />
        <Button type="submit">Save</Button>
      </Field>
      <FieldDescription>
        Make sure the name is unique. It will fail if you use existing name.
      </FieldDescription>
    </form>
  );
}

function PermissionSelection({ selected, onCheck }: PermissionSelectionRowProps) {
  // Load permissions
  const { data, error, isLoading } = useSWR<BetterFetchResponse<PermissionDefinitionResponse, ApiResponseException>>(
    "/api/management/offices/role-definitions", $fetch);

  const permissions = useMemo(() => {
    return new Set(selected);
  }, [selected]);

  if (isLoading) {
    return (<Loading />);
  }

  if (data?.error || error) {
    return (
      <Typography variant="p" className="text-red-400 text-center">
        Failed to load permission selector. Try again later.
      </Typography>
    );
  }

  return (
    <div className="-mx-4 no-scrollbar max-h-[50vh] overflow-y-auto px-4 grid grid-cols-3 gap-2">
      {
        (data?.data?.data || []).map((p, i) => (
          <FieldLabel key={p.permission}>
            <Field orientation="horizontal">
              <Checkbox
                id={`permission-${i}`}
                checked={permissions.has(p.permission)}
                onCheckedChange={() => onCheck(p.permission)}
              />
              <FieldContent>
                <FieldTitle>{p.permission}</FieldTitle>
                <FieldDescription>{p.description}</FieldDescription>
                {
                  p.note && (
                    <FieldDescription className="mt-2">
                      Note: {p.note}
                    </FieldDescription>
                  )
                }
              </FieldContent>
            </Field>
          </FieldLabel>
        ))
      }
    </div>
  );
}

function CreateRoleSection({ id, mutate }: CreateRoleComponentProps) {
  const [open, setOpen] = useState(false);

  const [roleName, setRoleName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Array<Permissions>>([]);

  const handleCheck = (permission: Permissions) => {
    setSelectedPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission],
    );
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const resp = await $fetch<RoleDefinitionResponse, ApiResponseException>(`/api/management/offices/${id}/roles`, {
      method: "POST",
      body: {
        name: roleName,
        permissions: selectedPermissions,
      },
    });

    if (resp?.data?.ok) {
      // Clear values
      setRoleName("");
      setSelectedPermissions([]);
      setOpen(false);

      // Send it to mutate the primary data
      mutate(resp!.data!.data!);

      alert("Role successfully created.");
      return;
    }

    alert("Failed to create role. Try again later.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TableRow className="cursor-pointer">
          <TableCell className="text-center" colSpan={2}>
            Create a new Role
          </TableCell>
        </TableRow>
      </DialogTrigger>
      <DialogContent className="min-w-[75%]">
        <DialogHeader>
          <DialogTitle>Create a new Role</DialogTitle>
          <DialogDescription>
            Set a new name of the role and the permissions you want to give.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="w-full">
          <Field className="mb-2">
            <FieldLabel htmlFor="role-name">Role Name</FieldLabel>
            <Input
              id="role-name"
              type="text"
              placeholder="President"
              value={roleName}
              onInput={e => setRoleName(e.currentTarget.value)}
              required
            />
            <FieldDescription>
              Make sure the name is unique. It will fail if you use existing name.
            </FieldDescription>
          </Field>
          <PermissionSelection selected={selectedPermissions} onCheck={handleCheck} />
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UpdateRoleSelection({ id, roleId, name, userCount, permissions, mutate }: UpdateRoleComponentProps) {
  const [open, setOpen] = useState(false);

  const [roleName, setRoleName] = useState(name || "");
  const [selectedPermissions, setSelectedPermissions] = useState<Array<Permissions>>(permissions || []);

  const handleCheck = (permission: Permissions) => {
    setSelectedPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission],
    );
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const resp = await $fetch<RoleDefinitionResponse, ApiResponseException>(`/api/management/offices/${id}/roles/${roleId}`, {
      method: "PATCH",
      body: {
        name: roleName,
        permissions: selectedPermissions,
      },
    });

    if (resp?.data?.ok) {
      // Clear values
      setOpen(false);

      // Send it to mutate the primary data
      mutate(resp!.data!.data!);

      alert("Role successfully updated.");
      return;
    }

    alert("Failed to update role. Try again later.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TableRow className="cursor-pointer">
          <TableCell>{name}</TableCell>
          <TableCell>{userCount} User{userCount === 1 ? "" : "s"}</TableCell>
        </TableRow>
      </DialogTrigger>
      <DialogContent className="min-w-[75%]">
        <DialogHeader>
          <DialogTitle>Update Role</DialogTitle>
          <DialogDescription>
            Update Permissions or Set a new Name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="w-full">
          <Field className="mb-2">
            <FieldLabel htmlFor="role-name">Role Name</FieldLabel>
            <Input
              id="role-name"
              type="text"
              placeholder="President"
              value={roleName}
              onInput={e => setRoleName(e.currentTarget.value)}
              required
            />
            <FieldDescription>
              Make sure the name is unique. It will fail if you use existing name.
            </FieldDescription>
          </Field>
          <PermissionSelection selected={selectedPermissions} onCheck={handleCheck} />
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">Update</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type CreateRoleComponentProps = {
  id: string;
  mutate: (role: OfficeSingleResponseWithRoleExtendedInfo["data"]["roles"][0]) => void;
}

type UpdateRoleComponentProps = {
  roleId: string;
  name: string;
  userCount: number;
  permissions: Array<Permissions>;
} & CreateRoleComponentProps;

type PermissionSelectionRowProps = {
  selected: Array<Permissions>,
  onCheck: (permission: Permissions) => void,
}
