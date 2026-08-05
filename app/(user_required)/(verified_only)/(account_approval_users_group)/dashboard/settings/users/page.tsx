'use client';

import {Copy, MoreHorizontal, Plus} from 'lucide-react';
import {type InputEvent, type SubmitEvent, useState} from 'react';
import useSWR from 'swr';

import DeadHamster from '@/components/dead-hamster';
import Loading from '@/components/loading';
import Typography from '@/components/typography';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Field, FieldGroup} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Spinner} from '@/components/ui/spinner';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import type {CreateAccountType, User} from '@/lib/accounts';
import {$fetch} from '@/lib/http/client/fetch';
import {
  AccountsListResponse,
  ApiResponseException,
  AssignableRolesListResponse,
  BetterFetchResponse,
  CreateAccountTypeResponse,
  OfficesListResponse,
  UserResponse,
} from '@/lib/http/client/responses';
import {cn} from '@/lib/utils';

export default function UsersPage() {
  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<AccountsListResponse, ApiResponseException>
  >('/api/management/credentials/users', $fetch);

  const handleMutateFn = (id: string, user: User) => {
    if (data?.data && Array.isArray(data.data.data)) {
      mutate({
        data: {
          ok: true,
          data: data.data.data.map((x) => {
            if (x.id === id) {
              return user;
            }

            return x;
          }),
        },
        error: undefined,
      }).catch(console.error);
    }
  };

  const handleAppendUser = (user: User) => {
    if (data?.data && Array.isArray(data.data.data)) {
      mutate({
        data: {
          ok: true,
          data: [...data.data.data, user],
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

  const users = data?.data?.data ?? [];

  return (
    <div className="p-4 pt-0 w-full">
      <div className="w-full flex gap-4 mb-4">
        <CreateUserDialog onUserCreated={handleAppendUser} />
      </div>
      <div className="border rounded-lg p-2">
        {users.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No users found.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="min-w-48 text-center">Full Name</TableHead>
                  <TableHead className="min-w-64 text-center">Email</TableHead>
                  <TableHead className="min-w-40 text-center">Office</TableHead>
                  <TableHead className="min-w-40 text-center">Role</TableHead>
                  <TableHead className="min-w-28 text-center">Status</TableHead>
                  <TableHead className="min-w-28 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user, index) => (
                  <Row key={user.id} data={user} index={index} mutateFn={handleMutateFn} />
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
  mutateFn,
}: {
  data: User;
  index: number;
  mutateFn: (id: string, user: User) => void;
}) {
  return (
    <TableRow className={cn(index % 2 === 1 ? 'bg-muted hover:bg-muted/50' : undefined)}>
      <TableCell className="font-medium whitespace-normal wrap-break-word">
        {data.fullName}
      </TableCell>
      <TableCell className="whitespace-normal wrap-break-word">{data.email}</TableCell>
      <TableCell className="whitespace-normal wrap-break-word">{data.office.name}</TableCell>
      <TableCell className="whitespace-normal wrap-break-word">{data.office.role.name}</TableCell>
      <TableCell className="text-center">{getStatusBadge(data)}</TableCell>
      <TableCell className="text-center">
        <UserActions user={data} mutateFn={mutateFn} />
      </TableCell>
    </TableRow>
  );
}

function getStatusBadge(user: User) {
  if (user.banned) {
    return (
      <Badge
        variant="outline"
        className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 border-0"
      >
        Banned
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="bg-green-500/15 text-green-700 hover:bg-green-500/25 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 border-0"
    >
      Active
    </Badge>
  );
}

function UserActions({user, mutateFn}: {user: User; mutateFn: (id: string, user: User) => void}) {
  const [isTogglingBan, setIsTogglingBan] = useState(false);

  const toggleBan = async () => {
    setIsTogglingBan(true);

    const {data, error} = await $fetch<UserResponse, ApiResponseException>(
      '/api/management/credentials/users/' + user.id + '/ban',
      {
        method: 'POST',
      },
    );
    if (error || !data.data) {
      alert('Failed to toggle ban. Try again later.');
      setIsTogglingBan(false);

      return;
    }

    mutateFn(data.data.id, data.data);
    setIsTogglingBan(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={isTogglingBan} className="text-destructive" onClick={toggleBan}>
          {user.banned ? `Unban ${user.fullName}` : `Ban ${user.fullName}`}
        </DropdownMenuItem>
        <ChangeRoleDialog user={user} mutateFn={mutateFn} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChangeRoleDialog({
  user,
  mutateFn,
}: {
  user: User;
  mutateFn: (id: string, data: User) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<string>(user.office.id);
  const [selectedRole, setSelectedRole] = useState<string | null>(user.office.role.id);

  const {data, error, isLoading} = useSWR<
    BetterFetchResponse<OfficesListResponse, ApiResponseException>
  >('/api/management/offices', $fetch);

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const result = await $fetch<UserResponse, ApiResponseException>(
      `/api/management/credentials/users/${user.id}/role`,
      {
        method: 'PATCH',
        body: {
          officeId: selectedOffice,
          roleId: selectedRole,
        },
      },
    );
    if (result.error) {
      alert('Failed to update user. Try again later.');
      return;
    }

    mutateFn(result.data.data.id, result.data.data);
    setOpen(false);
  };

  const handleSelectOffice = (id: string) => {
    setSelectedOffice(id);
    setSelectedRole(null);
  };

  const handleDropdownClick = (e: Event) => {
    e.preventDefault();
    setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={handleDropdownClick}>Change Office and Role</DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Office & Role of {user.fullName}</DialogTitle>
          <DialogDescription>
            Select the office and role you want to assign to {user.fullName}.
          </DialogDescription>
        </DialogHeader>
        {data?.error || error ? (
          <div>
            <Typography variant="p">Unable to load offices and roles. Try again later.</Typography>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <FieldGroup className="mb-4">
              <Field>
                <Label htmlFor="office">Office</Label>
                <Select value={selectedOffice} onValueChange={handleSelectOffice} required>
                  <SelectTrigger id="office">
                    {isLoading ? (
                      <SelectValue placeholder="Loading..." />
                    ) : (
                      <SelectValue placeholder="Select an Office" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(data?.data?.data || []).map((office, index) => (
                        <SelectItem key={index} value={office.id}>
                          {office.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <FieldGroup>
              <Field>
                <Label htmlFor="role">Role</Label>
                <Select value={selectedRole ?? ''} onValueChange={setSelectedRole} required>
                  <SelectTrigger id="role">
                    {isLoading ? (
                      <SelectValue placeholder="Loading..." />
                    ) : (
                      <SelectValue placeholder="Select an Role" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(data?.data?.data?.find((x) => x.id === selectedOffice)?.roles || []).map(
                        (role, index) => (
                          <SelectItem key={index} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ),
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit">Update</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PositionSelector({
  officeId,
  value,
  setValue,
}: {
  officeId: string;
  value: string;
  setValue: (v: string) => void;
}) {
  const {data, error, isLoading} = useSWR<
    BetterFetchResponse<AssignableRolesListResponse, ApiResponseException>
  >(officeId ? `/api/management/offices/positions?oId=${officeId}` : null, $fetch);

  return (
    <FieldGroup className="mt-4">
      <Field>
        <Label htmlFor="office-position">Position</Label>
        <Select
          disabled={isLoading || !!error || !!data?.error || !officeId}
          value={value}
          onValueChange={setValue}
          required
        >
          <SelectTrigger id="office-position">
            {isLoading ? (
              <SelectValue placeholder="Loading" />
            ) : (
              <SelectValue placeholder="Select an Office Position" />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(data?.data?.data || []).map((pos, index) => (
                <SelectItem key={index} value={pos.id}>
                  {pos.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}

function CreateUserDialog({onUserCreated}: {onUserCreated: (user: User) => void}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'form' | 'success'>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [office, setOffice] = useState('');
  const [officePosition, setOfficePosition] = useState('');
  const [activated, setActivated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<CreateAccountType | null>(null);

  const {data, error, isLoading} = useSWR<
    BetterFetchResponse<OfficesListResponse, ApiResponseException>
  >('/api/management/offices', $fetch);

  const resetForm = () => {
    setPhase('form');
    setFullName('');
    setEmail('');
    setOffice('');
    setOfficePosition('');
    setActivated(false);
    setCreatedAccount(null);
    setIsSubmitting(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);

    if (!isOpen) {
      resetForm();
    }
  };

  const handleSelectOffice = (id: string) => {
    setOffice(id);
    setOfficePosition('');
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const result = await $fetch<CreateAccountTypeResponse, ApiResponseException>(
      '/api/management/credentials/users',
      {
        method: 'POST',
        body: {
          fullName,
          email,
          officeId: office,
          officePositionId: officePosition,
          activated,
        },
      },
    );

    if (result.error || !result.data?.data) {
      alert('Failed to create user. Try again later.');
      setIsSubmitting(false);
      return;
    }

    const {password, ...user} = result.data.data;
    onUserCreated(user);
    setCreatedAccount({...user, password});
    setPhase('success');
    setIsSubmitting(false);
  };

  const copyPassword = async () => {
    if (!createdAccount?.password) {
      return;
    }

    await navigator.clipboard.writeText(createdAccount.password);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Create User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        {phase === 'success' && createdAccount ? (
          <>
            <DialogHeader>
              <DialogTitle>User Created</DialogTitle>
              <DialogDescription>
                Share the generated password with the user. It will not be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Full Name: </span>
                {createdAccount.fullName}
              </div>
              <div>
                <span className="text-muted-foreground">Email: </span>
                {createdAccount.email}
              </div>
              <div>
                <span className="text-muted-foreground">Office: </span>
                {createdAccount.office.name}
              </div>
              <div>
                <span className="text-muted-foreground">Position: </span>
                {createdAccount.office.role.name}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground shrink-0">Password: </span>
                <code className="flex-1 rounded bg-muted px-2 py-1 font-mono text-xs break-all">
                  {createdAccount.password}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={copyPassword}
                >
                  <Copy className="h-4 w-4" />
                  <span className="sr-only">Copy password</span>
                </Button>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>
                Create a new user account by specifying their details and office assignment.
              </DialogDescription>
            </DialogHeader>
            {data?.error || error ? (
              <div>
                <Typography variant="p">Unable to load offices. Try again later.</Typography>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <FieldGroup>
                  <Field>
                    <Label htmlFor="full-name">Full Name</Label>
                    <Input
                      id="full-name"
                      type="text"
                      placeholder="Example: Juan Dela Cruz"
                      value={fullName}
                      onInput={(e: InputEvent<HTMLInputElement>) =>
                        setFullName(e.currentTarget.value)
                      }
                      required
                    />
                  </Field>
                </FieldGroup>
                <FieldGroup className="mt-4">
                  <Field>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Example: example@gmail.com"
                      value={email}
                      onInput={(e: InputEvent<HTMLInputElement>) => setEmail(e.currentTarget.value)}
                      required
                    />
                  </Field>
                </FieldGroup>
                <FieldGroup className="mt-4">
                  <Field>
                    <Label htmlFor="create-office">Office</Label>
                    <Select
                      disabled={isLoading || !!error || !!data?.error}
                      value={office}
                      onValueChange={handleSelectOffice}
                      required
                    >
                      <SelectTrigger id="create-office">
                        {isLoading ? (
                          <SelectValue placeholder="Loading" />
                        ) : (
                          <SelectValue placeholder="Select an Office" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {(data?.data?.data || []).map((officeItem, index) => (
                            <SelectItem key={index} value={officeItem.id}>
                              {officeItem.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                {office && (
                  <PositionSelector
                    officeId={office}
                    value={officePosition}
                    setValue={setOfficePosition}
                  />
                )}
                <FieldGroup className="mt-4">
                  <Field orientation="horizontal">
                    <Checkbox
                      id="activated"
                      checked={activated}
                      onCheckedChange={(checked) => setActivated(checked === true)}
                    />
                    <Label htmlFor="activated">Activate account immediately</Label>
                  </Field>
                </FieldGroup>
                <DialogFooter className="mt-4">
                  <DialogClose asChild>
                    <Button variant="outline" type="button">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Spinner /> : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
