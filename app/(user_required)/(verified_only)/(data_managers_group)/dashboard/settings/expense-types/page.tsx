"use client";

import { Plus } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  ExpenseClassListResponse, ExpenseClassResponse,
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
import Typography from "@/components/typography";
import { validatorUtilities } from "@/lib/validators";

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<ExpenseClassListResponse, ApiResponseException>>("/api/management/data/expense-classes", $fetch);

  if (isLoading) {
    return (<Loading />);
  }

  if (error || data?.error) {
    return (<DeadHamster />);
  }

  const handleCreateMutate = (item: ExpenseClassResponse) => {
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

  const handleUpdateMutate = (item: ExpenseClassResponse) => {
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
        <Typography variant="h3" className="mb-4 grow">Expense Codes</Typography>
        <CreateExpenseClassDialog mutate={handleCreateMutate} />
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
            <TableHead>Account Name</TableHead>
            <TableHead>FPP</TableHead>
            <TableHead>Classification</TableHead>
            <TableHead>Sub-Classification</TableHead>
            <TableHead>Group</TableHead>
            <TableHead>Account Code</TableHead>
            <TableHead>Expense Class</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {
            (data?.data?.data || []).map(x => (
              <ExpenseClassRow key={x.id} data={x} mutate={handleUpdateMutate} />
            ))
          }
        </TableBody>
      </Table>
    </div>
  );
}

function CreateExpenseClassDialog({ mutate }: { mutate: (item: ExpenseClassResponse) => void}) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<ExpenseClassPayload>({
    accountName: "",
    fpp: undefined,
    classification: undefined,
    subClassification: undefined,
    group: undefined,
    accountCode: undefined,
    class: undefined,
  });

  const handleInput = (key: keyof ExpenseClassPayload, value: string) => {
    setPayload(prev => ({
      ...prev,
      [key]: key !== "accountName" && !validatorUtilities.isNotEmpty(value) ? undefined : value,
    }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<ExpenseClassResponse, ApiResponseException>("/api/management/data/expense-classes", {
      method: "POST",
      body: payload,
    });

    if (res.error || !res.data.data)  {
      alert("Failed to create expense class. Try again later.");
      return;
    }

    // Mutate the parent response.
    mutate(res.data);

    // Reset and close.
    alert("Expense class created successfully.");

    setPayload({
      accountName: "",
      fpp: undefined,
      classification: undefined,
      subClassification: undefined,
      group: undefined,
      accountCode: undefined,
      class: undefined,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="ml-auto">
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
                  placeholder="Enter the account name"
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

function ExpenseClassRow({ data, mutate }: { data: ExpenseClassResponse["data"], mutate: (item: ExpenseClassResponse) => void }) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<ExpenseClassPayload>({
    accountName: data.accountName,
    fpp: data.fpp,
    classification: data.classification,
    subClassification: data.subClassification,
    group: data.group,
    accountCode: data.accountCode,
    class: data.class,
  });

  const handleInput = (key: keyof ExpenseClassPayload, value: string) => {
    setPayload(prev => {
      return {
        ...prev,
        [key]: key !== "accountName" && !validatorUtilities.isNotEmpty(value) ? undefined : value,
      };
    });
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<ExpenseClassResponse, ApiResponseException>(`/api/management/data/expense-classes/${data.id}`, {
      method: "PATCH",
      body: payload,
    });

    if (res.error || !res.data.data)  {
      alert("Failed to update expense class. Try again later.");
      return;
    }

    // Mutate the parent response.
    mutate(res.data);

    // Close.
    alert("Expense class updated successfully.");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TableRow className="cursor-pointer">
          <TableCell className="font-medium">{data.accountName}</TableCell>
          <TableCell>{data.fpp}</TableCell>
          <TableCell>{data.classification}</TableCell>
          <TableCell>{data.subClassification}</TableCell>
          <TableCell>{data.group}</TableCell>
          <TableCell>{data.accountCode}</TableCell>
          <TableCell>{data.class}</TableCell>
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
                  placeholder="Enter the account name"
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

type ExpenseClassPayload = {
  accountName: string;
  fpp: Optional<string>;
  classification: Optional<string>;
  subClassification: Optional<string>;
  group: Optional<string>;
  accountCode: Optional<string>;
  class: Optional<string>;
}
