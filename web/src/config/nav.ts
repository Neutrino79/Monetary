import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ListOrdered,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Shuffle,
  Users,
  User,
  Landmark,
  Tag,
  Settings,
  ShieldCheck,
  Inbox,
  ScrollText,
  Server,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly (an index route such as the admin Overview). */
  end?: boolean;
  /** Show the number of pending account requests next to the label. */
  pendingBadge?: boolean;
  /** Only the superuser sees this entry. */
  superuserOnly?: boolean;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    section: "Overview",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { path: "/transactions", label: "Transactions", icon: ListOrdered },
      { path: "/reports", label: "Reports & Trends", icon: BarChart3 },
    ],
  },
  {
    section: "Money",
    items: [
      { path: "/income", label: "Income", icon: TrendingUp },
      { path: "/expenses", label: "Expenses", icon: TrendingDown },
      { path: "/transfers", label: "Transfers", icon: Shuffle },
    ],
  },
  {
    section: "Shared",
    items: [
      { path: "/shared", label: "Shared", icon: Users },
      { path: "/friends", label: "Friends", icon: User },
    ],
  },
  {
    section: "Setup",
    items: [
      { path: "/accounts", label: "Accounts", icon: Landmark },
      { path: "/categories", label: "Categories & tags", icon: Tag },
      { path: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export const MOBILE_TAB_PATHS = ["/dashboard", "/transactions", "/friends", "/reports", "/settings"];

/** The Admin area reuses the ledger shell; only the navigation, title and top-bar actions differ. */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    section: "Administration",
    items: [
      { path: "/admin", label: "Overview", icon: ShieldCheck, end: true },
      { path: "/admin/pending", label: "Requests", icon: Inbox, pendingBadge: true },
      { path: "/admin/users", label: "Users", icon: Users },
      { path: "/admin/audit", label: "Audit log", icon: ScrollText },
    ],
  },
  {
    section: "System",
    items: [{ path: "/admin/platform", label: "Platform", icon: Server, superuserOnly: true }],
  },
];

export const ALL_ADMIN_NAV_ITEMS: NavItem[] = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);

/** The phone tab bar: the four main admin pages, then a way back to the ledger. */
export const ADMIN_MOBILE_TAB_PATHS = ["/admin", "/admin/pending", "/admin/users", "/admin/audit", "/dashboard"];

/** True on any /admin page. */
export const isAdminPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");
