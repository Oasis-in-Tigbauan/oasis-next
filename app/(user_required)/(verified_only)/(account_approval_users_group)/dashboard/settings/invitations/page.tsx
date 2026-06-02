"use client";

import { Plus, RefreshCcw, Trash } from "lucide-react";
import { type InputEvent, type SubmitEvent, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  InvitationListResponse,
  InvitationResponse,
  OfficesListResponse,
} from "@/lib/http/client/responses";

import DeadHamster from "@/components/dead-hamster";
import { Badge } from "@/components/ui/badge";
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
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Loading from "@/components/loading";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default function Invitations() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<InvitationListResponse, ApiResponseException>>(
    "/api/management/approvals/invitation", $fetch);

  const onRevokeHandler = (id: string) => {
    if (data?.data && data.data.data) {
      mutate({
        data: {
          ok: true,
          data: data.data.data.filter(x => x.id !== id),
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  const handleInvite = (invitation: InvitationResponse) => {
    if (data?.data && data.data.data) {
      mutate({
        data: {
          ok: true,
          data: [...data.data.data, invitation.data],
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

  const invitations = data?.data?.data ?? [];

  return (
    <div className="p-4 pt-0 w-full">
      <div className="w-full flex gap-4 mb-4">
        <InvitationForm handleInvite={handleInvite} />
      </div>
      <div className="border rounded-lg p-2">
        {invitations.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No pending invitations.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="min-w-64 text-center">Email</TableHead>
                  <TableHead className="min-w-48 text-center">Office Position</TableHead>
                  <TableHead className="min-w-28 text-center">Status</TableHead>
                  <TableHead className="min-w-28 text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation, index) => (
                  <Row
                    key={invitation.id}
                    data={invitation}
                    index={index}
                    onRevoke={onRevokeHandler}
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

function Row({
  data,
  index,
  onRevoke,
}: {
  data: InvitationListResponse["data"][0];
  index: number;
  onRevoke: (id: string) => void;
}) {
  const [isRevoking, setIsRevoking] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleRevoke = async () => {
    setIsRevoking(true);

    const res = await $fetch<"", ApiResponseException>("/api/management/approvals/invitation/" + data.id, {
      method: "DELETE",
    });

    if (res.error) {
      alert("Failed to revoke invitation. Try again later.");
      return;
    }

    onRevoke(data.id);
  };

  const handleResend = async () => {
    setIsResending(true);

    const res = await $fetch<{ sent: boolean, errors?: object }, ApiResponseException>("/api/management/approvals/invitation/" + data.id, {
      method: "POST",
    });

    if (res.error) {
      alert("Failed to resend invitation. Try again later.");
    } else {
      if (res.data.errors) {
        alert("Invitation created, but failed to send the email. You can retry sending it later.");
        return;
      }

      alert("Invitation resent!");
    }

    setIsResending(false);
  };

  return (
    <TableRow
      className={cn(
        index % 2 === 1 ? "bg-muted hover:bg-muted/50" : undefined,
      )}
    >
      <TableCell className="font-medium whitespace-normal wrap-break-word">
        {data.email}
      </TableCell>
      <TableCell className="whitespace-normal wrap-break-word">
        {data.officeName}
      </TableCell>
      <TableCell className="text-center">
        <Badge
          variant="outline"
          className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 border-0"
        >
          Pending
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <div className="inline-flex gap-2">
          <Button
            onClick={handleResend}
            disabled={isResending}
            variant="outline"
            className="h-8 w-8"
          >
            {isResending ? (<Spinner />) : (<RefreshCcw />)}
          </Button>
          <Button
            onClick={handleRevoke}
            disabled={isRevoking}
            variant="outline"
            className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white"
          >
            {isRevoking ? (<Spinner />) : (<Trash />)}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function InvitationForm({ handleInvite }: { handleInvite: (invitation: InvitationResponse) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [office, setOffice] = useState("");

  const { data, error, isLoading } = useSWR<BetterFetchResponse<OfficesListResponse, ApiResponseException>>(
    "/api/management/offices", $fetch);

  const handleSetEmail = (e: InputEvent<HTMLInputElement>) => {
    setEmail(e.currentTarget.value);
  };

  const handleSelectOffice = (id: string) => {
    setOffice(id);
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const { data } = await $fetch<InvitationResponse, ApiResponseException>("/api/management/approvals/invitation", {
      method: "POST",
      body: {
        email,
        officeId: office,
      },
    });

    if (data?.ok) {
      handleInvite(data);

      if (data?.data?.errors) {
        alert("Invitation created, but failed to send the email. You can retry sending it later.");
      } else {
        alert("Invitation sent!");
      }

      // Clear values
      setEmail("");
      setOffice("");

      // Remove values
      setOpen(false);
      return;
    }

    alert("Failed to send invitation. Try again later.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Invite a Member to Organization
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite a Member to Organization</DialogTitle>
          <DialogDescription>
            Enter the email address of the member you want to invite and the office you want to assign them to.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Example: example@gmail.com"
                onInput={handleSetEmail}
                value={email}
                required
              />
            </Field>
          </FieldGroup>
          <FieldGroup className="mt-4">
            <Field>
              <Label htmlFor="office">Office</Label>
              <Select
                disabled={isLoading || error || data?.error}
                value={office}
                onValueChange={handleSelectOffice}
                required
              >
                <SelectTrigger id="office">
                  {
                    isLoading ? (
                      <SelectValue placeholder="Loading" />
                    ) : (
                      <SelectValue placeholder="Select an Office" />
                    )
                  }
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {
                      (data?.data?.data || []).map((office, index) => (
                        <SelectItem key={index} value={office.id}>{office.name}</SelectItem>
                      ))
                    }
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">Invite</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
