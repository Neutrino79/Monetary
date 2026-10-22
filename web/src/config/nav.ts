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
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
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
      { path: "/categories", label: "Categories", icon: Tag },
      { path: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export const MOBILE_TAB_PATHS = ["/dashboard", "/transactions", "/friends", "/reports", "/settings"];
