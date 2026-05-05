"use client";

import {
  ChevronRight,
  FileSpreadsheet,
  LampDesk,
  Mail,
  PhilippinePeso,
  Settings,
  ShieldUser,
  UserCheck,
} from "lucide-react";
import type { ComponentProps } from "react";
import * as permissions from "@/lib/db/permissions";
import type { User } from "@/lib/accounts";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export default function AppSidebar({ user, ...props }: AppSideBarProps) {
  const permissionMap = new Set(user.office.role.permissions);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" className="size-6">
                    <path d="M489.1 129.8C449.2 129.8 415.8 155.5 405.4 194.1C387.2 136 339.9 129.8 320.4 129.8C300.6 129.8 253.6 136.1 235.1 194.1C224.7 155.5 191.7 129.8 151.4 129.8C102.4 129.8 63.9 163.7 63.9 207C63.9 236 68.1 240.3 141.1 440.5C163.5 501.1 208.9 509.9 233.8 509.9C273 509.9 303.8 490.4 319.7 455.9C335.6 490.7 366.4 510.2 405.6 510.2C430.6 510.2 476 501.1 498.3 440.5C574.9 231.9 575.8 234.9 575.8 213.3C576.4 165 539.8 129.8 488.9 129.8zM515.4 244.6L449.9 421.1C442 442.6 428.7 458.3 403.7 458.3C380.3 458.3 366.3 445.9 359.7 424.4L320.4 307L319.4 307L280.1 424.4C273.1 445.9 259.2 458 236.1 458C211.1 458 197.8 442.3 189.9 420.8L124.9 245.6C119.5 230.8 117 221.7 117 211.1C117 194.8 132.8 181.7 155.3 181.7C174 181.7 187.3 193.5 191.4 210.8L235.4 350.6L236.4 350.6L281.1 213.8C287.1 194.1 297.6 181.7 320.1 181.7C342.6 181.7 353 193.8 359.1 213.8L403.8 350.6L404.8 350.6L448.8 210.8C452.9 193.6 466.2 181.7 484.9 181.7C507.1 181.7 523.2 195 523.2 217.4C522.9 225.3 519.1 233.4 515.6 244.6z" />
                  </svg>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-medium">{process.env.NEXT_PUBLIC_PROJECT_ORG_NAME}</span>
                  <span className="">v0.0.1-alpha</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Workspaces/Worksheets */}
        <SidebarGroup>
          <SidebarGroupLabel>Worksheets</SidebarGroupLabel>
          <SidebarGroupContent>
            {
              permissionMap.has(permissions.ESRE_READ) && (
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <FileSpreadsheet />
                    <a href="/dashboard/esre">ESRE</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            }
            {
              (
                permissionMap.has(permissions.OBR_MANAGEMENT_READ)
                || permissionMap.has(permissions.OBR_APPROVER_BASIC_READ)
                || permissionMap.has(permissions.OBR_APPROVER_BASIC_HIGH_WRITE)
                || permissionMap.has(permissions.OBR_APPROVER_ADVANCED_READ)
                || permissionMap.has(permissions.OBR_REQUEST_READ)
              ) && (
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <FileSpreadsheet />
                    <a href="/dashboard/obr">OBR</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            }
            {
              permissionMap.has(permissions.SUPPLEMENTAL_READ) && (
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <FileSpreadsheet />
                    <a href="/dashboard/supplemental">Supplemental</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            }
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Data Types Management */}
        {
          permissionMap.has(permissions.DATA_TYPES_MANAGE_READ) && permissionMap.has(permissions.DATA_TYPES_MANAGE_WRITE) && (
            <SidebarGroup>
              <SidebarGroupLabel>Data Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <PhilippinePeso />
                    <a href="/dashboard/settings/expense-types">Expense Types Definitions</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <PhilippinePeso />
                    <a href="/dashboard/settings/expense-codes">Expense Code Definitions</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <LampDesk />
                    <a href="/dashboard/settings/office-codes">Office Codes</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <PhilippinePeso />
                    <a href="/dashboard/settings/fund-types">Fund Types</a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        }

        {/* Administration Panel */}
        {
          permissionMap.has(permissions.APPROVALS_ACCOUNT_WRITE) && permissionMap.has(permissions.APPROVALS_ACCOUNT_READ) && (
            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <Mail />
                      <a href="/dashboard/settings/invitations">Invitations</a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <UserCheck />
                      <a href="/dashboard/settings/approvals">Approvals</a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <Collapsible asChild className="group/collapsible" defaultOpen={true}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <ShieldUser />
                          <span>Access Control</span>
                          <ChevronRight
                            className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild>
                              <a href="/dashboard/settings/roles">
                                <span>Office & Role Management</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild>
                              <a href="/dashboard/settings/users">
                                <span>User Management</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        }

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Settings />
                  <a href="/dashboard/settings">Settings</a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{
          name: user.fullName,
          email: user.email,
        }} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

type AppSideBarProps = {
  user: User;
} & ComponentProps<typeof Sidebar>;
