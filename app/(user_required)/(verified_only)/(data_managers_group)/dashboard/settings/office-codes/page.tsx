"use client";

import { Plus } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  OfficeCodeListResponse,
  OfficeCodeResponse,
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
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<OfficeCodeListResponse, ApiResponseException>>(
    "/api/management/data/office-codes", $fetch);

  if (isLoading) {
    return (<Loading />);
  }

  if (error || data?.error) {
    return (<DeadHamster />);
  }

  const handleCreateMutate = (item: OfficeCodeResponse) => {
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

  const handleUpdateMutate = (item: OfficeCodeResponse) => {
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
        <Typography variant="h3" className="mb-4 grow">Office Codes</Typography>
        <CreateOfficeCodeDialog mutate={handleCreateMutate} />
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
            <TableHead>AA</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Head</TableHead>
            <TableHead>Sector</TableHead>
            <TableHead>Function</TableHead>
            <TableHead>Lift Office</TableHead>
            <TableHead>Sub-office</TableHead>
            <TableHead>Office</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {
            (data?.data?.data || []).map(x => (
              <OfficeCodeRow key={x.id} data={x} mutate={handleUpdateMutate} />
            ))
          }
        </TableBody>
      </Table>
    </div>
  );
}

function CreateOfficeCodeDialog({ mutate }: { mutate: (item: OfficeCodeResponse) => void}) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<OfficeCodePayload>({
    aa: "",
    code: null,
    sector: null,
    function: null,
    liftOffice: null,
    subOffice: null,
    office: null,
    headUser: null,
  });

  const handleInput = (key: keyof OfficeCodePayload, value: string) => {
    setPayload(prev => ({
      ...prev,
      [key]: key !== "aa" && !validatorUtilities.isNotEmpty(value) ? undefined : value,
    }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<OfficeCodeResponse, ApiResponseException>(
      "/api/management/data/office-codes", { method: "POST", body: payload });

    if (res.error || !res.data.data)  {
      alert("Failed to create office code. Try again later.");
      return;
    }

    // Mutate the parent response.
    mutate(res.data);

    // Reset and close.
    alert("Office code created successfully.");

    setPayload({
      aa: "",
      code: null,
      sector: null,
      function: null,
      liftOffice: null,
      subOffice: null,
      office: null,
      headUser: null,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="ml-auto">
          <Plus />
          Add a new Office Code
        </Button>
      </DialogTrigger>
      <DialogContent className="min-w-[75%]">
        <DialogHeader>
          <DialogTitle>Create a new Office Code</DialogTitle>
          <DialogDescription>
            Enter the details of the office code you want to create.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="aa">AA</Label>
              <Input
                id="aa"
                type="text"
                placeholder="Enter the AA"
                value={payload.aa}
                onInput={e => handleInput("aa", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <FieldGroup>
              <Field>
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="Enter the Code"
                  value={payload.code ?? ""}
                  onInput={e => handleInput("code", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="sector">Sector</Label>
                <Input
                  id="sector"
                  type="text"
                  placeholder="Enter the sector"
                  value={payload.sector ?? ""}
                  onInput={e => handleInput("sector", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="function">Function</Label>
                <Input
                  id="function"
                  type="text"
                  placeholder="Enter the function"
                  value={payload.function ?? ""}
                  onInput={e => handleInput("function", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="lift-office">Lift Office</Label>
                <Input
                  id="lift-office"
                  type="text"
                  placeholder="Enter the Lift Office"
                  value={payload.liftOffice ?? ""}
                  onInput={e => handleInput("liftOffice", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="sub-office">Sub-Office</Label>
                <Input
                  id="sub-office"
                  type="text"
                  placeholder="Enter the sub-office"
                  value={payload.subOffice ?? ""}
                  onInput={e => handleInput("subOffice", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="office">Office</Label>
                <Input
                  id="office"
                  type="text"
                  placeholder="Enter the expense class"
                  value={payload.office ?? ""}
                  onInput={e => handleInput("office", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="headUser">Office Head</Label>
                <Input
                  id="headUser"
                  type="text"
                  placeholder="Enter the Office Head"
                  value={payload.headUser ?? ""}
                  onInput={e => handleInput("headUser", e.currentTarget.value)}
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

function OfficeCodeRow({ data, mutate }: { data: OfficeCodeResponse["data"], mutate: (item: OfficeCodeResponse) => void }) {
  const [open, setOpen] = useState(false);

  const [payload, setPayload] = useState<OfficeCodeUpdatePayload>({
    aa: data.aa,
    code: data.code,
    sector: data.sector,
    function: data.function,
    liftOffice: data.liftOffice,
    subOffice: data.subOffice,
    office: data.office,
    headUser: data.headUser,
  });

  const handleInput = (key: keyof OfficeCodeUpdatePayload, value: string) => {
    setPayload(prev => {
      return {
        ...prev,
        [key]: key !== "aa" && !validatorUtilities.isNotEmpty(value) ? undefined : value,
      };
    });
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const res = await $fetch<OfficeCodeResponse, ApiResponseException>(
      `/api/management/data/office-codes/${data.id}`, { method: "PATCH", body: payload });

    if (res.error || !res.data.data)  {
      alert("Failed to update the office code. Try again later.");
      return;
    }

    // Mutate the parent response.
    mutate(res.data);

    // Close.
    alert("Office code updated successfully.");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TableRow className="cursor-pointer">
          <TableCell className="font-medium">{data.aa}</TableCell>
          <TableCell>{data.code}</TableCell>
          <TableCell>{data.headUser}</TableCell>
          <TableCell>{data.sector}</TableCell>
          <TableCell>{data.function}</TableCell>
          <TableCell>{data.liftOffice}</TableCell>
          <TableCell>{data.subOffice}</TableCell>
          <TableCell>{data.office}</TableCell>
        </TableRow>
      </DialogTrigger>
      <DialogContent className="min-w-[75%]">
        <DialogHeader>
          <DialogTitle>Update Office Code</DialogTitle>
          <DialogDescription>
            Update the expense code details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="aa">AA</Label>
              <Input
                id="aa"
                type="text"
                placeholder="Enter the AA"
                value={payload.aa}
                onInput={e => handleInput("aa", e.currentTarget.value)}
                required
              />
            </Field>
          </FieldGroup>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <FieldGroup>
              <Field>
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="Enter the Code"
                  value={payload.code ?? ""}
                  onInput={e => handleInput("code", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="sector">Sector</Label>
                <Input
                  id="sector"
                  type="text"
                  placeholder="Enter the sector"
                  value={payload.sector ?? ""}
                  onInput={e => handleInput("sector", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="function">Function</Label>
                <Input
                  id="function"
                  type="text"
                  placeholder="Enter the function"
                  value={payload.function ?? ""}
                  onInput={e => handleInput("function", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="lift-office">Lift Office</Label>
                <Input
                  id="lift-office"
                  type="text"
                  placeholder="Enter the Lift Office"
                  value={payload.liftOffice ?? ""}
                  onInput={e => handleInput("liftOffice", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="sub-office">Sub-Office</Label>
                <Input
                  id="sub-office"
                  type="text"
                  placeholder="Enter the sub-office"
                  value={payload.subOffice ?? ""}
                  onInput={e => handleInput("subOffice", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="office">Office</Label>
                <Input
                  id="office"
                  type="text"
                  placeholder="Enter the expense class"
                  value={payload.office ?? ""}
                  onInput={e => handleInput("office", e.currentTarget.value)}
                />
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="headUser">Office Head</Label>
                <Input
                  id="headUser"
                  type="text"
                  placeholder="Enter the Office Head"
                  value={payload.headUser ?? ""}
                  onInput={e => handleInput("headUser", e.currentTarget.value)}
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

type OfficeCodePayload = {
  aa: string;
  code: Optional<string>;
  sector: Optional<string>;
  function: Optional<string>;
  liftOffice: Optional<string>;
  subOffice: Optional<string>;
  office: Optional<string>;
  headUser: Optional<string>;
}

type OfficeCodeUpdatePayload = Partial<OfficeCodePayload>;
