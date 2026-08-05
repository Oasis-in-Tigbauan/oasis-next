'use client';

import {Check, X} from 'lucide-react';
import {useState} from 'react';
import useSWR from 'swr';

import DeadHamster from '@/components/dead-hamster';
import Loading from '@/components/loading';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {$fetch} from '@/lib/http/client/fetch';
import type {
  ApiResponseException,
  BetterFetchResponse,
  UnactivatedListResponse,
} from '@/lib/http/client/responses';
import {cn} from '@/lib/utils';

export default function ApprovalsPage() {
  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<UnactivatedListResponse, ApiResponseException>
  >('/api/management/approvals/pending', $fetch);

  const handleStateChange = (id: string) => {
    if (data?.data && data.data.data) {
      mutate({
        data: {
          ok: true,
          data: data.data.data.filter((x) => x.id !== id),
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  if (isLoading) {
    return <Loading />;
  }

  if (error || data?.error) {
    return <DeadHamster />;
  }

  const pendingUsers = data?.data?.data ?? [];

  return (
    <div className="p-4 pt-0 w-full">
      <div className="border rounded-lg p-2">
        {pendingUsers.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No pending approvals.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="min-w-64 text-center">Email</TableHead>
                  <TableHead className="min-w-48 text-center">Full Name</TableHead>
                  <TableHead className="min-w-40 text-center">Office</TableHead>
                  <TableHead className="min-w-40 text-center">Position</TableHead>
                  <TableHead className="min-w-40 text-center">Registration Date</TableHead>
                  <TableHead className="min-w-28 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((user, index) => (
                  <Row
                    key={user.id}
                    data={user}
                    index={index}
                    handleStateChange={handleStateChange}
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

function Row({data, index, handleStateChange}: RowProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const sendApproval = async (accept: boolean) => {
    const result = await $fetch<'', ApiResponseException>(
      `/api/management/approvals/pending/${data.id}`,
      {
        method: 'PATCH',
        body: {
          accept,
        },
      },
    );

    if (result.error) {
      alert('Failed to accept the user. Try again later.');
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
    <TableRow className={cn(index % 2 === 1 ? 'bg-muted hover:bg-muted/50' : undefined)}>
      <TableCell className="whitespace-normal wrap-break-word">{data.email}</TableCell>
      <TableCell className="whitespace-normal wrap-break-word">{data.fullName}</TableCell>
      <TableCell className="whitespace-normal wrap-break-word">{data.office.name}</TableCell>
      <TableCell className="whitespace-normal wrap-break-word">{data.office.role.name}</TableCell>
      <TableCell className="whitespace-normal wrap-break-word">{data.registrationDate}</TableCell>
      <TableCell className="text-center">
        <div className="inline-flex gap-2">
          <Button
            onClick={acceptHandler}
            disabled={isAccepting || isRejecting}
            variant="outline"
            className="h-8 w-8"
          >
            {isAccepting ? <Spinner /> : <Check />}
          </Button>
          <Button
            onClick={declineHandler}
            disabled={isAccepting || isRejecting}
            variant="outline"
            className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white"
          >
            {isRejecting ? <Spinner /> : <X />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

type RowProps = {
  data: UnactivatedListResponse['data'][0];
  index: number;
  handleStateChange: (id: string) => void;
};
