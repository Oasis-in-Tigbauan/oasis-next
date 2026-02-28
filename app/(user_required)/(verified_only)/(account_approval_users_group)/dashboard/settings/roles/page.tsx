"use client";

import { Plus, RefreshCcw } from "lucide-react";
import { redirect, RedirectType } from "next/navigation";
import { type SubmitEvent, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  OfficeSingleResponse,
  OfficesExtendedListResponse,
} from "@/lib/http/client/responses";

import { Button } from "@/components/ui/button";
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
import DeadHamster from "@/components/dead-hamster";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
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

export default function RolesPage() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<OfficesExtendedListResponse, ApiResponseException>>(
    "/api/management/offices/extended",
    $fetch,
  );

  const triggerMutate = (entry: OfficesExtendedListResponse["data"][0]) => {
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
    return (<Loading />);
  }

  if (data?.error || error) {
    return (<DeadHamster />);
  }

  return (
    <div className="p-4 pt-0 w-full">
      <div className="w-full flex gap-4 mb-4">
        <Typography variant="h3" className="grow">Offices</Typography>
        <Button variant="outline" className="ml-auto" onClick={() => mutate()}>
          <RefreshCcw />
          Refresh
        </Button>
        <AddOfficeDialog handleCreate={triggerMutate} />
      </div>
      <Table>
        <TableCaption>
          {
            isLoading ? "Loading..." : (error || data?.error)
              ? "Hmm. That didn't work. Try again later."
              : `Loaded total of ${(data?.data?.data || []).length} offices.`
          }
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-55">Office Name</TableHead>
            <TableHead>User Count</TableHead>
            <TableHead>Role Count</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {
            (data?.data?.data || []).map((office) => (
              <Row key={office.id} data={office} />
            ))
          }
        </TableBody>
      </Table>
    </div>
  );
}

function Row({ data }: { data: OfficesExtendedListResponse["data"][0] }) {
  const goTo = () => redirect(`/dashboard/settings/roles/${data.id}/roles`, RedirectType.replace);

  return (
    <TableRow className="cursor-pointer" onClick={goTo}>
      <TableCell>{data.name}</TableCell>
      <TableCell>{data.userCount}</TableCell>
      <TableCell>{data.roleCount}</TableCell>
    </TableRow>
  );
}

function AddOfficeDialog({ handleCreate }: { handleCreate: (invitation: OfficesExtendedListResponse["data"][0]) => void }) {
  const [open, setOpen] = useState(false);
  const [office, setOffice] = useState("");

  const handleInputOffice = (name: string) => {
    setOffice(name);
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const { data } = await $fetch<OfficeSingleResponse, ApiResponseException>("/api/management/offices", {
      method: "POST",
      body: {
        name: office,
      },
    });

    if (data?.ok) {
      handleCreate({
        id: data.data.id,
        name: data.data.name,
        userCount: 0,
        roleCount: 0,
      });
      alert("Created a new office successfully.");

      // Clear values
      setOffice("");

      // Remove values
      setOpen(false);
      return;
    }

    alert("Failed to create office. Try again later.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="mb-4">
          <Plus />
          Add Office
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create a new office</DialogTitle>
          <DialogDescription>
            Enter the name of the office you want to create.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="officeName">Name</Label>
              <Input
                id="officeName"
                type="text"
                placeholder="Office of the President"
                onInput={e => handleInputOffice(e.currentTarget.value)}
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
