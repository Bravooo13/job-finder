import {
  Bot,
  Briefcase,
  Building2,
  Columns3,
  FileSignature,
  Inbox,
  ListChecks,
  LayoutDashboard,
  Map,
  Radar,
  Send,
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
  { href: "/apply", label: "Apply", icon: Send },
  { href: "/compare", label: "Compare", icon: Columns3 },
  { href: "/map", label: "Map", icon: Map },
  { href: "/searches", label: "Searches", icon: Radar },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/profile", label: "Profile & resumes", icon: UserRound },
  { href: "/cover-letters", label: "Cover letters", icon: FileSignature },
  { href: "/assistant", label: "AI agents", icon: Bot },
  { href: "/activity", label: "Activity", icon: ListChecks },
];
