"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  UnactivatedListResponse,
} from "@/lib/http/client/responses";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table, TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ApprovalsPage() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<UnactivatedListResponse, ApiResponseException>>(
    "/api/management/approvals/pending",
    $fetch,
  );

  const handleStateChange = (id: string) => {
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
  
  return (
    <div className="p-4 pt-0 w-full">

      <Table>
        <TableCaption>
          {
            isLoading ? "Loading..." : (error || data?.error) ? "Hmm. That didn't work. Try again later." : "That's all!"
          }
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Full Name</TableHead>
            <TableHead>Office</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Registration Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {
            (data?.data?.data || []).map(user => (
              <Row key={user.id} data={user} handleStateChange={handleStateChange} />
            ))
          }
        </TableBody>
      </Table>
    </div>
  );
}

function Row({ data, handleStateChange }: RowProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const sendApproval = async (accept: boolean) => {
    const result = await $fetch<"", ApiResponseException>(`/api/management/approvals/pending/${data.id}`, {
      method: "PATCH",
      body: {
        accept,
      },
    });

    if (result.error) {
      alert("Failed to accept the user. Try again later.");
      return false;
    }

    return true;
  };

  const acceptHandler = async () => {
    setIsAccepting(true);

    const result = await sendApproval(true);
    if (!result) return;

    handleStateChange(data.id);
  };

  const declineHandler = async () => {
    setIsRejecting(true);

    const result = await sendApproval(false);
    if (!result) return;

    handleStateChange(data.id);
  };

  return (
    <TableRow>
      <TableCell>{data.email}</TableCell>
      <TableCell>{data.fullName}</TableCell>
      <TableCell>{data.office.name}</TableCell>
      <TableCell>{data.office.role.name}</TableCell>
      <TableCell>{data.registrationDate}</TableCell>
      <TableCell className="text-right space-x-2">
        <Button
          onClick={acceptHandler}
          disabled={isAccepting || isRejecting}
          variant="outline"
          className="h-8 w-8"
        >
          {
            isAccepting ? (<Spinner />) : (<Check />)
          }
        </Button>
        <Button
          onClick={declineHandler}
          disabled={isAccepting || isRejecting}
          variant="outline"
          className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white">
          {
            isRejecting ? (<Spinner />) : (<X />)
          }
        </Button>
      </TableCell>
    </TableRow>
  );
}

type RowProps = {
  data: UnactivatedListResponse["data"][0];
  handleStateChange: (id: string) => void;
};
