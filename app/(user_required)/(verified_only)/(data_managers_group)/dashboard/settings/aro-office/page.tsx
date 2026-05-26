"use client";

import { Plus } from "lucide-react";
import { type SubmitEvent, useMemo, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
} from "@/lib/http/client/responses";

import { Button } from "@/components/ui/button";
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
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { validatorUtilities } from "@/lib/validators";

type AROUser = {
  id: string;
  name: string;
  position: {
    id: string;
    name: string;
  };
};

type AROItem = {
  id: string;
  name: string;
  description: Optional<string>;
  code: string;
  leadUser: AROUser;
};

type AROListResponse = {
  ok: true;
  data: AROItem[];
};

type AROResponse = {
  ok: true;
  data: AROItem;
};

type AROUsersResponse = {
  ok: true;
  data: AROUser[];
};

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<AROListResponse, ApiResponseException>>(
    "/api/management/data/aro-office", $fetch);

  if (isLoading) {
    return (<Loading />);
  }

  if (error || data?.error) {
    return (<DeadHamster />);
  }

  const handleCreateMutate = (item: AROResponse) => {
    if (data?.data?.data && Array.isArray(data?.data?.data)) {
      mutate({
        data: {
          ok: true,
          data: [...(data?.data?.data || []), item.data],
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  const handleUpdateMutate = (item: AROResponse) => {
    if (data?.data?.data && Array.isArray(data?.data?.data)) {
      mutate({
        data: {
          ok: true,
          data: (data?.data?.data || []).map(x => {
            if (x.id === item.data.id) return item.data;
            return x;
          }),
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  return (
    <div className="p-4 pt-0 w-full">
      <div className="w-full flex gap-4">
        <CreateARODialog mutate={handleCreateMutate} />
      </div>
      <Table>
        <TableCaption>
          Loaded total of&nbsp;
          <span>
            {data?.data?.data && Array.isArray(data.data.data) ? data.data.data.length : 0}
          </span>&nbsp;items
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Lead User</TableHead>
            <TableHead>Lead Position</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {
            (data?.data?.data || []).map(x => (
              <ARORow key={x.id} data={x} mutate={handleUpdateMutate} />
            ))
          }
        </TableBody>
      </Table>
    </div>
  );
}

function CreateARODialog({ mutate }: { mutate: (item: AROResponse) => void}) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<AROPayload>({
    name: "",
    code: "",
    description: "",
    leadUserId: "",
  });
  const [selectedLeadUserName, setSelectedLeadUserName] = useState("");

  const handleInput = (key: keyof AROPayload, value: string) => {
    setPayload(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<AROResponse, ApiResponseException>(
      "/api/management/data/aro-office",
      {
        method: "POST",
        body: payload,
      });

    if (res.error || !res.data.data)  {
      alert("Failed to create ARO Office Definition. Try again later.");
      return;
    }

    mutate(res.data);

    alert("ARO Office Definition created successfully.");

    setPayload({
      name: "",
      code: "",
      description: "",
      leadUserId: "",
    });
    setSelectedLeadUserName("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="ml-auto">
          <Plus />
          Add a new ARO Office Definition
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new ARO Office Definition</DialogTitle>
          <DialogDescription>
            Enter the details of the ARO office definition you want to create.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="mb-4">
            <Field>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter ARO office name"
                value={payload.name}
                onInput={e => handleInput("name", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <FieldGroup className="mb-4">
            <Field>
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                type="text"
                placeholder="Enter ARO office code"
                value={payload.code}
                onInput={e => handleInput("code", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <FieldGroup className="mb-4">
            <Field>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                type="text"
                placeholder="Enter description"
                value={payload.description}
                onInput={e => handleInput("description", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>

          <AROLeadUserSelector
            leadUserId={payload.leadUserId}
            selectedLabel={selectedLeadUserName}
            onSelect={x => {
              handleInput("leadUserId", x.id);
              setSelectedLeadUserName(`${x.name} (${x.position.name})`);
            }}
          />

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

function ARORow({ data, mutate }: { data: AROItem, mutate: (item: AROResponse) => void }) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<AROUpdatePayload>({
    name: data.name,
    code: data.code,
    description: data.description ?? undefined,
    leadUserId: data.leadUser.id,
  });
  const [selectedLeadUserName, setSelectedLeadUserName] = useState(`${data.leadUser.name} (${data.leadUser.position.name})`);

  const handleInput = (key: keyof AROUpdatePayload, value: string) => {
    setPayload(prev => ({
      ...prev,
      [key]: key === "name" || key === "code" || key === "description"
        ? value
        : (!validatorUtilities.isNotEmpty(value) ? undefined : value),
    }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<AROResponse, ApiResponseException>(
      `/api/management/data/aro-office/${data.id}`,
      {
        method: "PATCH",
        body: payload,
      });

    if (res.error || !res.data.data)  {
      alert("Failed to update ARO Office Definition. Try again later.");
      return;
    }

    mutate(res.data);

    alert("ARO Office Definition updated successfully.");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TableRow className="cursor-pointer">
          <TableCell className="font-medium">{data.name}</TableCell>
          <TableCell>{data.code}</TableCell>
          <TableCell>{data.description}</TableCell>
          <TableCell>{data.leadUser.name}</TableCell>
          <TableCell>{data.leadUser.position.name}</TableCell>
        </TableRow>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update ARO Office Definition</DialogTitle>
          <DialogDescription>
            Update the ARO office definition details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="mb-4">
            <Field>
              <Label htmlFor={`name-${data.id}`}>Name</Label>
              <Input
                id={`name-${data.id}`}
                type="text"
                placeholder="Enter ARO office name"
                value={payload.name ?? ""}
                onInput={e => handleInput("name", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <FieldGroup className="mb-4">
            <Field>
              <Label htmlFor={`code-${data.id}`}>Code</Label>
              <Input
                id={`code-${data.id}`}
                type="text"
                placeholder="Enter ARO office code"
                value={payload.code ?? ""}
                onInput={e => handleInput("code", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <FieldGroup className="mb-4">
            <Field>
              <Label htmlFor={`description-${data.id}`}>Description</Label>
              <Input
                id={`description-${data.id}`}
                type="text"
                placeholder="Enter description"
                value={payload.description ?? ""}
                onInput={e => handleInput("description", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>

          <AROLeadUserSelector
            leadUserId={payload.leadUserId ?? ""}
            selectedLabel={selectedLeadUserName}
            onSelect={x => {
              handleInput("leadUserId", x.id);
              setSelectedLeadUserName(`${x.name} (${x.position.name})`);
            }}
          />

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

function AROLeadUserSelector({
  leadUserId,
  selectedLabel,
  onSelect,
}: {
  leadUserId: string;
  selectedLabel: string;
  onSelect: (user: AROUser) => void;
}) {
  const [query, setQuery] = useState("");

  const key = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;

    return `/api/management/data/aro-office/users?q=${encodeURIComponent(trimmed)}`;
  }, [query]);

  const { data, error, isLoading } = useSWR<BetterFetchResponse<AROUsersResponse, ApiResponseException>>(
    key,
    $fetch,
  );

  const users = data?.data?.data ?? [];

  return (
    <>
      <FieldGroup className="mb-3">
        <Field>
          <Label htmlFor="lead-user-search">Search Lead User</Label>
          <Input
            id="lead-user-search"
            type="text"
            placeholder="Type name or email"
            value={query}
            onInput={e => setQuery(e.currentTarget.value)}
          />
        </Field>
      </FieldGroup>

      <FieldGroup className="mb-4">
        <Field>
          <Label htmlFor="lead-user-selected">Selected Lead User</Label>
          <Input
            id="lead-user-selected"
            type="text"
            value={selectedLabel}
            placeholder="No user selected"
            readOnly
            required
          />
          <input type="hidden" value={leadUserId} required readOnly />
        </Field>
      </FieldGroup>

      {!!query.trim() && (
        <div className="mb-4 max-h-52 overflow-y-auto rounded-md border border-input bg-background p-1">
          {isLoading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching users...</div>
          )}
          {!isLoading && (error || data?.error) && (
            <div className="px-3 py-2 text-sm text-destructive">Unable to load users.</div>
          )}
          {!isLoading && !error && !data?.error && users.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No users found.</div>
          )}
          {users.map(x => (
            <button
              key={x.id}
              type="button"
              className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onSelect(x);
                setQuery("");
              }}
            >
              <span className="font-medium">{x.name}</span>
              <span className="ml-2 text-muted-foreground">{x.position.name}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

type AROPayload = {
  name: string;
  code: string;
  description: string;
  leadUserId: string;
};

type AROUpdatePayload = Partial<AROPayload>;
