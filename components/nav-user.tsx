"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { useMemo } from "react";

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function NavUser({
  user,
}: {
    user: {
        name: string
        email: string
        subtitle?: string
    }
}) {
  const { isMobile } = useSidebar();

  const userAbbreviation = useMemo(() => {
    const split = user.name.split(/\s/);

    // Impossible, but it's there.
    if (split.length === 0) return "?";

    // For people who only provided their name
    if (split.length === 1) return split[0][0].toUpperCase();

    const first = split[0];
    const last = split[split.length - 1];

    return `${first[0]}${last[0]}`.toUpperCase();
  }, [user]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-9 rounded-md px-2 text-white data-[state=open]:bg-white/10 data-[state=open]:text-white hover:bg-white/8"
            >
              <Avatar className="h-7 w-7 rounded-full border border-white/20">
                <AvatarFallback className="rounded-full bg-[#FFCC4D] text-[#1A1A1A]">
                  {userAbbreviation}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-[11.5px] font-medium">{user.name}</span>
                <span className="truncate text-[10.5px] text-white/68">{user.subtitle ?? user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-3.5 text-white/74" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-full">
                  <AvatarFallback className="rounded-full">{userAbbreviation}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => redirect("/auth/signout")}>
              <LogOut />
                            Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
