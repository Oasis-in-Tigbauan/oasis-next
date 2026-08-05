'use client';

import {Plus, RefreshCcw} from 'lucide-react';
import {redirect, RedirectType} from 'next/navigation';
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
import {Field, FieldDescription, FieldGroup} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {$fetch} from '@/lib/http/client/fetch';
import {
  ApiResponseException,
  BetterFetchResponse,
  OfficeSingleResponse,
  OfficesExtendedListResponse,
} from '@/lib/http/client/responses';
import {cn} from '@/lib/utils';

export default function RolesPage() {
  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<OfficesExtendedListResponse, ApiResponseException>
  >('/api/management/offices/extended', $fetch);

  const triggerMutate = (entry: OfficesExtendedListResponse['data'][0]) => {
    if (data?.data && data.data.data) {
      mutate({
        data: {
          ok: true,
          data: [...data.data.data, entry],
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  if (isLoading) {
    return <Loading />;
  }

  if (data?.error || error) {
    return <DeadHamster />;
  }

  const offices = data?.data?.data ?? [];

  return (
    <div className="p-4 pt-0 w-full">
      <div className="w-full flex gap-4 mb-4">
        <Button variant="outline" className="ml-auto" onClick={() => mutate()}>
          <RefreshCcw />
          Refresh
        </Button>
        <AddOfficeDialog handleCreate={triggerMutate} />
      </div>
      <div className="border rounded-lg p-2">
        {offices.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No offices found.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="min-w-64 text-center">Office Name</TableHead>
                  <TableHead className="min-w-32 text-center">User Count</TableHead>
                  <TableHead className="min-w-32 text-center">Role Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offices.map((office, index) => (
                  <Row key={office.id} data={office} index={index} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({data, index}: {data: OfficesExtendedListResponse['data'][0]; index: number}) {
  const goTo = () => redirect(`/dashboard/settings/roles/${data.id}/roles`, RedirectType.replace);

  return (
    <TableRow
      className={cn('cursor-pointer', index % 2 === 1 ? 'bg-muted hover:bg-muted/50' : undefined)}
      onClick={goTo}
    >
      <TableCell className="font-medium whitespace-normal wrap-break-word">{data.name}</TableCell>
      <TableCell className="text-center">{data.userCount}</TableCell>
      <TableCell className="text-center">{data.roleCount}</TableCell>
    </TableRow>
  );
}

function AddOfficeDialog({
  handleCreate,
}: {
  handleCreate: (invitation: OfficesExtendedListResponse['data'][0]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [office, setOffice] = useState('');

  const handleInputOffice = (name: string) => {
    setOffice(name);
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const {data} = await $fetch<OfficeSingleResponse, ApiResponseException>(
      '/api/management/offices',
      {
        method: 'POST',
        body: {
          name: office,
        },
      },
    );

    if (data?.ok) {
      handleCreate({
        id: data.data.id,
        name: data.data.name,
        userCount: 0,
        roleCount: 0,
      });
      alert('Created a new office successfully.');

      // Clear values
      setOffice('');

      // Remove values
      setOpen(false);
      return;
    }

    alert('Failed to create office. Try again later.');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add Office
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create a new office</DialogTitle>
          <DialogDescription>Enter the name of the office you want to create.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="officeName">Name</Label>
              <Input
                id="officeName"
                type="text"
                placeholder="Office of the President"
                onInput={(e) => handleInputOffice(e.currentTarget.value)}
                value={office}
                required
              />
              <FieldDescription>
                Make sure the name is unique. It will fail if you use existing name.
              </FieldDescription>
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
