"use client";

import { Plus } from "lucide-react";
import { type SubmitEvent, useMemo, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  ExpenseClassListResponse,
  ExpenseClassResponse,
  OfficeCodeListResponse,
} from "@/lib/http/client/responses";

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

type ExpenseClassItem = ExpenseClassListResponse["data"][number];

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<ExpenseClassListResponse, ApiResponseException>>(
    "/api/management/data/expense-classes",
    $fetch,
  );

  const { data: officeCodesData } = useSWR<BetterFetchResponse<OfficeCodeListResponse, ApiResponseException>>(
    "/api/management/data/office-codes",
    $fetch,
  );

  if (isLoading) {
    return (<Loading />);
  }

  if (error || data?.error) {
    return (<DeadHamster />);
  }

  const officeCodes = officeCodesData?.data?.data ?? [];

  const handleCreateMutate = (item: ExpenseClassResponse) => {
    if (data?.data?.data && Array.isArray(data.data.data)) {
      mutate({
        data: {
          ok: true,
          data: [...data.data.data, item.data],
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  const handleUpdateMutate = (item: ExpenseClassResponse) => {
    if (data?.data?.data && Array.isArray(data.data.data)) {
      mutate({
        data: {
          ok: true,
          data: data.data.data.map(x => x.id === item.data.id ? item.data : x),
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  const handleDeleteMutate = (id: string) => {
    if (data?.data?.data && Array.isArray(data.data.data)) {
      mutate({
        data: {
          ok: true,
          data: data.data.data.filter(x => x.id !== id),
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  return (
    <div className="p-4 pt-0 w-full">
      <div className="w-full flex gap-4 mb-4">
        <CreateExpenseClassDialog mutate={handleCreateMutate} officeCodes={officeCodes} />
      </div>
      <div className="border rounded-lg p-2">
        {(data?.data?.data ?? []).length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No expense codes found.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="min-w-48 text-center">Account Name</TableHead>
                  <TableHead className="min-w-24 text-center">FPP</TableHead>
                  <TableHead className="min-w-36 text-center">Classification</TableHead>
                  <TableHead className="min-w-40 text-center">Sub-Classification</TableHead>
                  <TableHead className="min-w-28 text-center">Group</TableHead>
                  <TableHead className="min-w-32 text-center">Account Code</TableHead>
                  <TableHead className="min-w-32 text-center">Expense Class</TableHead>
                  <TableHead className="min-w-48 text-center">Allowed Office Codes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.data?.data ?? []).map((x, index) => (
                  <ExpenseClassRow
                    key={x.id}
                    data={x}
                    index={index}
                    mutate={handleUpdateMutate}
                    mutateDelete={handleDeleteMutate}
                    officeCodes={officeCodes}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function OfficeCodes({ officeCodes, selectedIds, onToggle }: {
  officeCodes: OfficeCodeListResponse["data"];
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  const selectedSet = new Set(selectedIds);
  return (
    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded p-2">
      {officeCodes.map(oc => (
        <div key={oc.id} className="flex items-center gap-2">
          <Checkbox
            id={`oc-${oc.id}`}
            checked={selectedSet.has(oc.id)}
            onCheckedChange={checked => onToggle(oc.id, checked === true)}
          />
          <Label htmlFor={`oc-${oc.id}`} className="cursor-pointer">{oc.aa}</Label>
        </div>
      ))}
    </div>
  );
}

function CreateExpenseClassDialog({
  mutate,
  officeCodes,
}: {
  mutate: (item: ExpenseClassResponse) => void;
  officeCodes: OfficeCodeListResponse["data"];
}) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<ExpenseClassPayload>({
    accountName: "",
    fpp: undefined,
    classification: undefined,
    subClassification: undefined,
    group: undefined,
    accountCode: undefined,
    class: undefined,
    allowedOfficeCodeIds: [],
  });

  const handleInput = (key: keyof Omit<ExpenseClassPayload, "allowedOfficeCodeIds">, value: string) => {
    setPayload(prev => ({
      ...prev,
      [key]: key !== "accountName" && !validatorUtilities.isNotEmpty(value) ? undefined : value,
    }));
  };

  const handleToggleOfficeCode = (id: string, checked: boolean) => {
    setPayload(prev => {
      const ids = new Set(prev.allowedOfficeCodeIds);
      if (checked) ids.add(id);
      else ids.delete(id);
      return { ...prev, allowedOfficeCodeIds: Array.from(ids) };
    });
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<ExpenseClassResponse, ApiResponseException>("/api/management/data/expense-classes", {
      method: "POST",
      body: payload,
    });

    if (res.error || !res.data.data) {
      alert("Failed to create expense class. Try again later.");
      return;
    }

    mutate(res.data);
    alert("Expense class created successfully.");

    setPayload({
      accountName: "",
      fpp: undefined,
      classification: undefined,
      subClassification: undefined,
      group: undefined,
      accountCode: undefined,
      class: undefined,
      allowedOfficeCodeIds: [],
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="ml-auto">
          <Plus />
          Add a new Expense Code
        </Button>
      </DialogTrigger>
      <DialogContent className="min-w-[75%]">
        <DialogHeader>
          <DialogTitle>Create a new Expense Code</DialogTitle>
          <DialogDescription>
            Enter the details of the expense code you want to create.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="accountName">Account Name</Label>
              <Input
                id="accountName"
                type="text"
                placeholder="Enter the account name"
                value={payload.accountName}
                onInput={e => handleInput("accountName", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <FieldGroup>
              <Field>
                <Label htmlFor="fpp">FPP</Label>
                <Input
                  id="fpp"
                  type="text"
                  placeholder="Enter the FPP"
                  value={payload.fpp ?? ""}
                  onInput={e => handleInput("fpp", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="classification">Classification</Label>
                <Input
                  id="classification"
                  type="text"
                  placeholder="Enter the classification"
                  value={payload.classification ?? ""}
                  onInput={e => handleInput("classification", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="subClassification">Sub-classification</Label>
                <Input
                  id="subClassification"
                  type="text"
                  placeholder="Enter the sub-classification"
                  value={payload.subClassification ?? ""}
                  onInput={e => handleInput("subClassification", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="group">Group</Label>
                <Input
                  id="group"
                  type="text"
                  placeholder="Enter the group name"
                  value={payload.group ?? ""}
                  onInput={e => handleInput("group", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="accountCode">Account Code</Label>
                <Input
                  id="accountCode"
                  type="text"
                  placeholder="Enter the account code"
                  value={payload.accountCode ?? ""}
                  onInput={e => handleInput("accountCode", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="expenseClass">Expense Class</Label>
                <Input
                  id="expenseClass"
                  type="text"
                  placeholder="Enter the expense class"
                  value={payload.class ?? ""}
                  onInput={e => handleInput("class", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
          </div>
          <FieldGroup className="mt-4">
            <Field>
              <Label>Allowed Office Codes <span className="text-muted-foreground text-xs">(leave empty to allow all)</span></Label>
              <OfficeCodes
                officeCodes={officeCodes}
                selectedIds={payload.allowedOfficeCodeIds ?? []}
                onToggle={handleToggleOfficeCode}
              />
            </Field>
          </FieldGroup>
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

function ExpenseClassRow({
  data,
  index,
  mutate,
  mutateDelete,
  officeCodes,
}: {
  data: ExpenseClassItem;
  index: number;
  mutate: (item: ExpenseClassResponse) => void;
  mutateDelete: (id: string) => void;
  officeCodes: OfficeCodeListResponse["data"];
}) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<ExpenseClassPayload>({
    accountName: data.accountName,
    fpp: data.fpp,
    classification: data.classification,
    subClassification: data.subClassification,
    group: data.group,
    accountCode: data.accountCode,
    class: data.class,
    allowedOfficeCodeIds: data.allowedFor.map(x => x.id),
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setPayload({
        accountName: data.accountName,
        fpp: data.fpp,
        classification: data.classification,
        subClassification: data.subClassification,
        group: data.group,
        accountCode: data.accountCode,
        class: data.class,
        allowedOfficeCodeIds: data.allowedFor.map(x => x.id),
      });
    }
    setOpen(isOpen);
  };

  const allowedOfficeCodesText = useMemo(() => {
    if (!data.allowedFor.length) return "All";
    return data.allowedFor.map(x => x.aa).join(", ");
  }, [data.allowedFor]);

  const handleInput = (key: keyof Omit<ExpenseClassPayload, "allowedOfficeCodeIds">, value: string) => {
    setPayload(prev => ({
      ...prev,
      [key]: key !== "accountName" && !validatorUtilities.isNotEmpty(value) ? undefined : value,
    }));
  };

  const handleToggleOfficeCode = (id: string, checked: boolean) => {
    setPayload(prev => {
      const ids = new Set(prev.allowedOfficeCodeIds);
      if (checked) ids.add(id);
      else ids.delete(id);
      return { ...prev, allowedOfficeCodeIds: Array.from(ids) };
    });
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<ExpenseClassResponse, ApiResponseException>(
      `/api/management/data/expense-classes/${data.id}`,
      { method: "PATCH", body: payload },
    );

    if (res.error || !res.data.data) {
      alert("Failed to update expense class. Try again later.");
      return;
    }

    mutate(res.data);
    alert("Expense class updated successfully.");
    setOpen(false);
  };

  const handleDelete = async () => {
    const confirmed = confirm("Soft delete this expense class?");
    if (!confirmed) return;

    const res = await $fetch<null, ApiResponseException>(
      `/api/management/data/expense-classes/${data.id}`,
      { method: "DELETE" },
    );

    if (res.error) {
      alert("Failed to delete expense class. Try again later.");
      return;
    }

    mutateDelete(data.id);
    alert("Expense class deleted successfully.");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <TableRow
          className={cn(
            "cursor-pointer",
            index % 2 === 1 ? "bg-muted hover:bg-muted/50" : undefined,
          )}
        >
          <TableCell className="font-medium whitespace-normal wrap-break-word">
            {data.accountName}
          </TableCell>
          <TableCell className="whitespace-normal wrap-break-word">{data.fpp ?? "-"}</TableCell>
          <TableCell className="whitespace-normal wrap-break-word">
            {data.classification ?? "-"}
          </TableCell>
          <TableCell className="whitespace-normal wrap-break-word">
            {data.subClassification ?? "-"}
          </TableCell>
          <TableCell className="whitespace-normal wrap-break-word">{data.group ?? "-"}</TableCell>
          <TableCell className="whitespace-normal wrap-break-word">{data.accountCode ?? "-"}</TableCell>
          <TableCell className="whitespace-normal wrap-break-word">{data.class ?? "-"}</TableCell>
          <TableCell className="whitespace-normal wrap-break-word">{allowedOfficeCodesText}</TableCell>
        </TableRow>
      </DialogTrigger>
      <DialogContent className="min-w-[75%]">
        <DialogHeader>
          <DialogTitle>Update Expense Code</DialogTitle>
          <DialogDescription>
            Update the expense code details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="accountName">Account Name</Label>
              <Input
                id="accountName"
                type="text"
                placeholder="Enter the account name"
                value={payload.accountName}
                onInput={e => handleInput("accountName", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <FieldGroup>
              <Field>
                <Label htmlFor="fpp">FPP</Label>
                <Input
                  id="fpp"
                  type="text"
                  placeholder="Enter the FPP"
                  value={payload.fpp ?? ""}
                  onInput={e => handleInput("fpp", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="classification">Classification</Label>
                <Input
                  id="classification"
                  type="text"
                  placeholder="Enter the classification"
                  value={payload.classification ?? ""}
                  onInput={e => handleInput("classification", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="subClassification">Sub-classification</Label>
                <Input
                  id="subClassification"
                  type="text"
                  placeholder="Enter the sub-classification"
                  value={payload.subClassification ?? ""}
                  onInput={e => handleInput("subClassification", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="group">Group</Label>
                <Input
                  id="group"
                  type="text"
                  placeholder="Enter the group name"
                  value={payload.group ?? ""}
                  onInput={e => handleInput("group", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="accountCode">Account Code</Label>
                <Input
                  id="accountCode"
                  type="text"
                  placeholder="Enter the account code"
                  value={payload.accountCode ?? ""}
                  onInput={e => handleInput("accountCode", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="expenseClass">Expense Class</Label>
                <Input
                  id="expenseClass"
                  type="text"
                  placeholder="Enter the expense class"
                  value={payload.class ?? ""}
                  onInput={e => handleInput("class", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
          </div>
          <FieldGroup className="mt-4">
            <Field>
              <Label>Allowed Office Codes <span className="text-muted-foreground text-xs">(leave empty to allow all)</span></Label>
              <OfficeCodes
                officeCodes={officeCodes}
                selectedIds={payload.allowedOfficeCodeIds ?? []}
                onToggle={handleToggleOfficeCode}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="destructive" onClick={handleDelete}>Delete</Button>
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

type ExpenseClassPayload = {
  accountName: string;
  fpp: Optional<string>;
  classification: Optional<string>;
  subClassification: Optional<string>;
  group: Optional<string>;
  accountCode: Optional<string>;
  class: Optional<string>;
  allowedOfficeCodeIds: string[];
}
