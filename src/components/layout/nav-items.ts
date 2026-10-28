import {
  Briefcase,
  Building2,
  Inbox,
  LayoutDashboard,
  Map,
  Radar,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/found", label: "Found jobs", icon: Inbox },
  { href: "/jobs", label: "My jobs", icon: Briefcase },
  { href: "/map", label: "Map", icon: Map },
  { href: "/searches", label: "Searches", icon: Radar },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/profile", label: "Profile & resumes", icon: UserRound },
];
