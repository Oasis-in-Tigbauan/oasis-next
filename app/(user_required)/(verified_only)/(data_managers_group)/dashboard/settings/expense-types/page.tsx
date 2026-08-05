'use client';

import {Plus} from 'lucide-react';
import {type SubmitEvent, useState} from 'react';
import useSWR from 'swr';

import DeadHamster from '@/components/dead-hamster';
import Loading from '@/components/loading';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {Field, FieldGroup} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {$fetch} from '@/lib/http/client/fetch';
import {
  ApiResponseException,
  BetterFetchResponse,
  ExpenseTypeListResponse,
  ExpenseTypeResponse,
} from '@/lib/http/client/responses';
import {cn} from '@/lib/utils';

export default function Page() {
  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<ExpenseTypeListResponse, ApiResponseException>
  >('/api/management/data/expense-type', $fetch);

  if (isLoading) {
    return <Loading />;
  }

  if (error || data?.error) {
    return <DeadHamster />;
  }

  const handleCreateMutate = (item: ExpenseTypeResponse) => {
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

  const handleUpdateMutate = (item: ExpenseTypeResponse) => {
    if (data?.data?.data && Array.isArray(data?.data?.data)) {
      mutate({
        data: {
          ok: true,
          data: (data?.data?.data || []).map((x) => {
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
        <CreateExpenseTypeDialog mutate={handleCreateMutate} />
      </div>
      <div className="border rounded-lg p-2">
        {(data?.data?.data || []).length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No expense types found.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="min-w-64 text-center">Name</TableHead>
                  <TableHead className="min-w-80 text-center">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.data?.data || []).map((x, index) => (
                  <ExpenseTypeRow key={x.id} data={x} index={index} mutate={handleUpdateMutate} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateExpenseTypeDialog({mutate}: {mutate: (item: ExpenseTypeResponse) => void}) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<ExpenseTypePayload>({
    name: '',
    description: null,
  });

  const handleInput = (key: keyof ExpenseTypePayload, value: string) => {
    setPayload((prev) => ({
      ...prev,
      [key]: key !== 'name' && !((value?.trim() ?? '').length > 0) ? undefined : value,
    }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<ExpenseTypeResponse, ApiResponseException>(
      '/api/management/data/expense-type',
      {
        method: 'POST',
        body: payload,
      },
    );

    if (res.error || !res.data.data) {
      alert('Failed to create expense type. Try again later.');
      return;
    }

    // Mutate the parent response.
    mutate(res.data);

    // Reset and close.
    alert('Expense type created successfully.');

    setPayload({
      name: '',
      description: null,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="ml-auto">
          <Plus />
          Add a new Expense Type
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new Expense Type</DialogTitle>
          <DialogDescription>
            Enter the details of the expense type you want to create.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="mb-4">
            <Field>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter the expense type name"
                value={payload.name}
                onInput={(e) => handleInput('name', e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                type="text"
                placeholder="Enter the expense type description"
                value={payload.description ?? ''}
                onInput={(e) => handleInput('description', e.currentTarget.value)}
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

function ExpenseTypeRow({
  data,
  index,
  mutate,
}: {
  data: ExpenseTypeResponse['data'];
  index: number;
  mutate: (item: ExpenseTypeResponse) => void;
}) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<ExpenseTypePayload>({
    name: data.name,
    description: data.description,
  });

  const handleInput = (key: keyof ExpenseTypePayload, value: string) => {
    setPayload((prev) => {
      return {
        ...prev,
        [key]: key !== 'name' && !((value?.trim() ?? '').length > 0) ? undefined : value,
      };
    });
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<ExpenseTypeResponse, ApiResponseException>(
      `/api/management/data/expense-type/${data.id}`,
      {
        method: 'PATCH',
        body: payload,
      },
    );

    if (res.error || !res.data.data) {
      alert('Failed to update expense type. Try again later.');
      return;
    }

    // Mutate the parent response.
    mutate(res.data);

    // Close.
    alert('Expense type updated successfully.');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TableRow
          className={cn(
            'cursor-pointer',
            index % 2 === 1 ? 'bg-muted hover:bg-muted/50' : undefined,
          )}
        >
          <TableCell className="font-medium whitespace-normal wrap-break-word">
            {data.name}
          </TableCell>
          <TableCell className="whitespace-normal wrap-break-word">
            {data.description ?? '-'}
          </TableCell>
        </TableRow>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Expense Type</DialogTitle>
          <DialogDescription>Update the expense type details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="mb-4">
            <Field>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter the account name"
                value={payload.name}
                onInput={(e) => handleInput('name', e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                type="text"
                placeholder="Enter the expense type description"
                value={payload.description ?? ''}
                onInput={(e) => handleInput('description', e.currentTarget.value)}
              />
            </Field>
          </FieldGroup>
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

type ExpenseTypePayload = {
  name: string;
  description: Optional<string>;
};
