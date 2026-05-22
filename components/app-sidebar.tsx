"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  Car,
  ChevronRight,
  FileSpreadsheet,
  Home,
  LampDesk,
  Mail,
  PhilippinePeso,
  PlugZap,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  ShieldUser,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties, ComponentProps } from "react";

import type { User } from "@/lib/accounts";
import * as permissions from "@/lib/db/permissions";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type SidebarItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
};

type SidebarSubItem = {
  title: string;
  href: string;
};

const sidebarStyle = {
  "--sidebar-width": "12.75rem",
  "--sidebar-width-icon": "3.1rem",
} as CSSProperties;

export default function AppSidebar({ user, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const permissionMap = new Set(user.office.role.permissions);
  const hasPermission = (permission: permissions.Permissions) => permissionMap.has(permission);
  const hasAnyPermission = (...requiredPermissions: permissions.Permissions[]) =>
    requiredPermissions.some((permission) => permissionMap.has(permission));
  const hasAllPermissions = (...requiredPermissions: permissions.Permissions[]) =>
    requiredPermissions.every((permission) => permissionMap.has(permission));

  const primaryItems: SidebarItem[] = [
    { title: "Home", href: "/dashboard", icon: Home, exact: true },
  ];

  const worksheetItems: SidebarItem[] = [
    hasPermission(permissions.ESRE_READ) ? { title: "ESRE", href: "/dashboard/esre", icon: FileSpreadsheet } : null,
    hasAnyPermission(
      permissions.OBR_MANAGEMENT_READ,
      permissions.OBR_APPROVER_BASIC_READ,
      permissions.OBR_APPROVER_BASIC_HIGH_WRITE,
      permissions.OBR_APPROVER_ADVANCED_READ,
      permissions.OBR_REQUEST_READ,
    ) ? { title: "OBR", href: "/dashboard/obr", icon: BriefcaseBusiness } : null,
    hasAnyPermission(permissions.SAAOB_OFFICE_READ, permissions.SAAOB_DATA_READ) ? { title: "SAAOB", href: "/dashboard/saaob", icon: FileSpreadsheet } : null,
    hasAnyPermission(permissions.LBAC_DATA_READ, permissions.LBAC_OFFICE_READ) ? { title: "LBAC", href: "/dashboard/lbac", icon: FileSpreadsheet } : null,
    hasPermission(permissions.SUPPLEMENTAL_READ) ? { title: "Supplemental", href: "/dashboard/supplemental", icon: FileSpreadsheet } : null,
    hasPermission(permissions.AIP_READ) ? { title: "AIP", href: "/dashboard/aip", icon: FileSpreadsheet } : null,
  ].filter((item): item is SidebarItem => item !== null);

  const officeFormItems: SidebarItem[] = [
    hasPermission(permissions.PURCHASING_REQUEST_MANAGE) ? { title: "PR/PO Form", href: "/dashboard/forms/purchasing", icon: ShoppingBasket } : null,
    hasPermission(permissions.PPMP_READ) ? { title: "PPMP", href: "/dashboard/forms/ppmp", icon: ShoppingCart } : null,
    hasPermission(permissions.OBR_DISBURSEMENT_CREATE) ? { title: "DV-Elec", href: "/dashboard/forms/elec", icon: PlugZap } : null,
    hasAnyPermission(
      permissions.TRAVEL_READ,
      permissions.TRAVEL_WRITE,
      permissions.TRAVEL_APPROVER,
    ) ? { title: "Travel Orders", href: "/dashboard/forms/travel-order", icon: Car } : null,
  ].filter((item): item is SidebarItem => item !== null);

  const dataManagementItems: SidebarItem[] = hasAllPermissions(
    permissions.DATA_TYPES_MANAGE_READ,
    permissions.DATA_TYPES_MANAGE_WRITE,
  ) ? [
      { title: "Expense Types", href: "/dashboard/settings/expense-types", icon: PhilippinePeso },
      { title: "Expense Codes", href: "/dashboard/settings/expense-codes", icon: PhilippinePeso },
      { title: "Office Codes", href: "/dashboard/settings/office-codes", icon: LampDesk },
      { title: "Fund Types", href: "/dashboard/settings/fund-types", icon: PhilippinePeso },
      { title: "Procurement Types", href: "/dashboard/settings/procurement-types", icon: BriefcaseBusiness },
    ] : [];

  const administrationItems: SidebarItem[] = hasAllPermissions(
    permissions.APPROVALS_ACCOUNT_WRITE,
    permissions.APPROVALS_ACCOUNT_READ,
  ) ? [
      { title: "Invitations", href: "/dashboard/settings/invitations", icon: Mail },
      { title: "Approvals", href: "/dashboard/settings/approvals", icon: UserCheck },
    ] : [];

  const accessControlItems: SidebarSubItem[] = hasAllPermissions(
    permissions.APPROVALS_ACCOUNT_WRITE,
    permissions.APPROVALS_ACCOUNT_READ,
  ) ? [
      { title: "Role Management", href: "/dashboard/settings/roles" },
      { title: "User Management", href: "/dashboard/settings/users" },
    ] : [];

  const accessControlActive = accessControlItems.some((item) => isPathActive(pathname, item.href));

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      style={sidebarStyle}
      className="top-0 bottom-0 left-0 h-svh"
      {...props}
    >
      <SidebarHeader className="bg-[#4E72AA] px-3 pt-4 pb-2 text-white group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <div className="w-[48px]">
            <Image
              src={process.env.NEXT_PUBLIC_PROJECT_ORG_SEAL as string}
              alt="Organization logo"
              width={32}
              height={32}
              className="size-8 object-cover bg-white border-white/30 rounded-full shadow-sm"
              priority
            />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-wrap text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
              {process.env.NEXT_PUBLIC_PROJECT_ORG_NAME as string}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-2 overflow-x-hidden bg-[#4E72AA] px-3 py-2 text-white group-data-[collapsible=icon]:px-2">
        <SidebarNavGroup items={primaryItems} pathname={pathname} />
        <SidebarSection label="Worksheets" items={worksheetItems} pathname={pathname} />
        <SidebarSection label="Office Forms" items={officeFormItems} pathname={pathname} />
        <SidebarSection label="Data Management" items={dataManagementItems} pathname={pathname} />

        {administrationItems.length > 0 && (
          <SidebarGroup className="gap-1.5 border-t border-white/18 pt-2 p-0">
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/72">
              Account
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {administrationItems.map((item) => (
                  <SidebarNavItem key={item.href} item={item} pathname={pathname} />
                ))}
                {accessControlItems.length > 0 && (
                  <Collapsible asChild defaultOpen={accessControlActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={accessControlActive}
                          tooltip="Access Control"
                          className="h-8.5 rounded-md px-2.5 text-[11.5px] font-medium text-white/88 data-[active=true]:bg-white/16 data-[active=true]:text-white hover:bg-white/6 hover:text-white"
                        >
                          <ShieldUser className="size-3.5" />
                          <span>Access Control</span>
                          <ChevronRight className="ml-auto size-3.5 text-white/50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="mx-2 mt-1 gap-0.5 border-white/14 pl-2.5">
                          {accessControlItems.map((item) => (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isPathActive(pathname, item.href)}
                                className="rounded-md px-2 text-[11px] text-white/78 data-[active=true]:bg-white/14 data-[active=true]:text-white hover:bg-white/6 hover:text-white"
                              >
                                <Link href={item.href}>
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}
                <SidebarNavItem
                  item={{ title: "Settings", href: "/dashboard/settings", icon: Settings, exact: true }}
                  pathname={pathname}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-white/18 bg-[#4E72AA] px-3 py-2 text-white group-data-[collapsible=icon]:px-2">
        <NavUser
          user={{
            name: user.fullName,
            email: user.email,
            subtitle: user.office.role.name,
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function SidebarSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: SidebarItem[];
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <SidebarGroup className="gap-1.5 border-t border-white/18 pt-2 p-0">
      <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/72">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => (
            <SidebarNavItem key={item.href} item={item} pathname={pathname} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarNavGroup({
  items,
  pathname,
}: {
  items: SidebarItem[];
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <SidebarGroup className="gap-1 p-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => (
            <SidebarNavItem key={item.href} item={item} pathname={pathname} highlight />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarNavItem({
  item,
  pathname,
  highlight = false,
}: {
  item: SidebarItem;
  pathname: string;
  highlight?: boolean;
}) {
  const active = isPathActive(pathname, item.href, item.exact);
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.title}
        className={cn(
          "h-8.5 rounded-md px-2.5 text-[11.5px] font-medium text-white/88 hover:bg-white/6 hover:text-white",
          active && !highlight && "bg-white text-[#335892] shadow-sm",
          highlight && active && "bg-white text-[#335892] shadow-sm",
          highlight && !active && "bg-transparent",
        )}
      >
        <Link href={item.href}>
          <Icon
            className={cn(
              "size-3.5 shrink-0 transition-colors group-hover/menu-button:text-white/92",
              active ? "text-[#335892]" : "text-white/70",
            )}
          />
          <span className="truncate">{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function isPathActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;

  return pathname === href || pathname.startsWith(`${href}/`);
}

type AppSidebarProps = {
  user: User;
} & ComponentProps<typeof Sidebar>;
