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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
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
      <div className="w-full flex gap-4 mb-4">
        <CreateARODialog mutate={handleCreateMutate} />
      </div>
      <div className="border rounded-lg p-2">
        {(data?.data?.data || []).length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No ARO office definitions found.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="min-w-48 text-center">Name</TableHead>
                  <TableHead className="min-w-32 text-center">Code</TableHead>
                  <TableHead className="min-w-64 text-center">Description</TableHead>
                  <TableHead className="min-w-48 text-center">Lead User</TableHead>
                  <TableHead className="min-w-48 text-center">Lead Position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.data?.data || []).map((x, index) => (
                  <ARORow key={x.id} data={x} index={index} mutate={handleUpdateMutate} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
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
        <Button className="ml-auto">
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

function ARORow({
  data,
  index,
  mutate,
}: {
  data: AROItem;
  index: number;
  mutate: (item: AROResponse) => void;
}) {
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
        <TableRow
          className={cn(
            "cursor-pointer",
            index % 2 === 1 ? "bg-muted hover:bg-muted/50" : undefined,
          )}
        >
          <TableCell className="font-medium whitespace-normal wrap-break-word">
            {data.name}
          </TableCell>
          <TableCell className="whitespace-normal wrap-break-word">{data.code}</TableCell>
          <TableCell className="whitespace-normal wrap-break-word">
            {data.description ?? "-"}
          </TableCell>
          <TableCell className="whitespace-normal wrap-break-word">
            {data.leadUser.name}
          </TableCell>
          <TableCell className="whitespace-normal wrap-break-word">
            {data.leadUser.position.name}
          </TableCell>
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
