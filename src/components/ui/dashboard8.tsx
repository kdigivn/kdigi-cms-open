/* eslint-disable */
"use client";

import {
  ArrowUpDown,
  BarChart3,
  Bell,
  Box,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ClipboardList,
  Download,
  Filter,
  Globe,
  Grid3x3,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Minus,
  Package,
  RotateCcw,
  Search,
  Settings,
  TrendingDown,
  TrendingUp,
  Truck,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import * as React from "react";
import type { TooltipProps } from "recharts";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";
import { cn } from "cn";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip as ShadTooltip,
  TooltipContent as ShadTooltipContent,
  TooltipProvider as ShadTooltipProvider,
  TooltipTrigger as ShadTooltipTrigger,
} from "@/components/ui/tooltip";
type NavItem = {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  href: string;
  isActive?: boolean;
  children?: NavItem[];
};

type NavGroup = {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
};

type UserData = {
  name: string;
  email: string;
  avatar: string;
};

type SidebarData = {
  logo: {
    src: string;
    alt: string;
    title: string;
    description: string;
  };
  navGroups: NavGroup[];
  footerGroup: NavGroup;
  user?: UserData;
};

type InvoicePriority = "High" | "Medium" | "Low";
type InvoiceStatus = "Paid" | "Pending" | "Overdue" | "Draft";

type Invoice = {
  id: string;
  invoiceId: string;
  customer: string;
  customerInitials: string;
  date: string;
  amount: number;
  priority: InvoicePriority;
  status: InvoiceStatus;
};

type InvoiceSortKey = "customer" | "invoiceId" | "date" | "amount";

type RichMetricStatItem = {
  title: string;
  value: number;
  trendValue: number;
  footerDelta: number;
  footerSubtextCount: number;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

const compactCurrencyOneDecimalFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const invoiceDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const numberFormatter = new Intl.NumberFormat("en-US");

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });
const dashboardRangeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dashboardRangeStart = new Date(2025, 0, 1);
const dashboardRangeEnd = new Date(2025, 0, 31);
const dashboardDateRangeLabel =
  typeof dashboardRangeFormatter.formatRange === "function"
    ? dashboardRangeFormatter.formatRange(
        dashboardRangeStart,
        dashboardRangeEnd,
      )
    : `${dashboardRangeFormatter.format(
        dashboardRangeStart,
      )} – ${dashboardRangeFormatter.format(dashboardRangeEnd)}`;

const mixBase = "var(--background)";

const palette = {
  primary: "var(--primary)",
  secondary: {
    light: `color-mix(in oklch, var(--primary) 75%, ${mixBase})`,
    dark: `color-mix(in oklch, var(--primary) 85%, ${mixBase})`,
  },
  tertiary: {
    light: `color-mix(in oklch, var(--primary) 55%, ${mixBase})`,
    dark: `color-mix(in oklch, var(--primary) 65%, ${mixBase})`,
  },
  quaternary: {
    light: `color-mix(in oklch, var(--primary) 40%, ${mixBase})`,
    dark: `color-mix(in oklch, var(--primary) 45%, ${mixBase})`,
  },
};

const sidebarData: SidebarData = {
  logo: {
    src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/logos/shadcnblocks-logo.svg",
    alt: "Acme Store",
    title: "Acme Store",
    description: "Ecommerce",
  },
  navGroups: [
    {
      title: "Main",
      defaultOpen: true,
      items: [
        {
          label: "Dashboard",
          icon: LayoutDashboard,
          href: "#",
          isActive: true,
        },
        { label: "Orders", icon: ClipboardList, href: "#" },
        { label: "Returns", icon: RotateCcw, href: "#" },
      ],
    },
    {
      title: "Catalog",
      defaultOpen: true,
      items: [
        {
          label: "Products",
          icon: Box,
          href: "#",
          children: [
            { label: "All Products", icon: Package, href: "#" },
            { label: "Categories", icon: Package, href: "#" },
            { label: "Inventory", icon: Package, href: "#" },
          ],
        },
        { label: "Shipping", icon: Truck, href: "#" },
      ],
    },
    {
      title: "Customers",
      defaultOpen: false,
      items: [
        { label: "All Customers", icon: Users, href: "#" },
        { label: "Messages", icon: MessageSquare, href: "#" },
      ],
    },
    {
      title: "Analytics",
      defaultOpen: false,
      items: [
        { label: "Overview", icon: Globe, href: "#" },
        { label: "Reports", icon: BarChart3, href: "#" },
        { label: "Finances", icon: Wallet, href: "#" },
      ],
    },
  ],
  footerGroup: {
    title: "Settings",
    items: [{ label: "Settings", icon: Settings, href: "#" }],
  },
  user: {
    name: "John Doe",
    email: "john@acme.store",
    avatar:
      "https://deifkwefumgah.cloudfront.net/shadcnblocks/block/avatar-1.webp",
  },
};

const richMetricStats: RichMetricStatItem[] = [
  {
    title: "In-store Sales",
    value: 7820.75,
    trendValue: 4.3,
    footerDelta: 322.5,
    footerSubtextCount: 5000,
  },
  {
    title: "Website Sales",
    value: 985_937.45,
    trendValue: 12.5,
    footerDelta: 109_500,
    footerSubtextCount: 21_000,
  },
  {
    title: "Wholesale",
    value: 124_650,
    trendValue: 6.8,
    footerDelta: 7_935,
    footerSubtextCount: 890,
  },
  {
    title: "Returns",
    value: 15_503,
    trendValue: -3.1,
    footerDelta: -498,
    footerSubtextCount: 6000,
  },
];

const weeklyRevenueData = [
  {
    day: weekdayFormatter.format(new Date(2025, 0, 6)),
    revenue: 1200,
    expenses: 800,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 7)),
    revenue: 1500,
    expenses: 600,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 8)),
    revenue: 1800,
    expenses: 1100,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 9)),
    revenue: 1100,
    expenses: 900,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 10)),
    revenue: 1600,
    expenses: 1200,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 11)),
    revenue: 800,
    expenses: 400,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 12)),
    revenue: 900,
    expenses: 500,
  },
];

const revenueChartConfig = {
  revenue: { label: "Revenue", color: palette.primary },
  expenses: { label: "Expenses", theme: palette.secondary },
} satisfies ChartConfig;

const monthLabel = (monthIndex: number) =>
  monthFormatter.format(new Date(2025, monthIndex, 1));

const salesPipelineData: Record<
  string,
  { week: string; month: string; orders: number; sales: number }[]
> = {
  q1: [
    { week: "W1", month: monthLabel(0), orders: 220, sales: 5100 },
    { week: "W2", month: monthLabel(0), orders: 480, sales: 11200 },
    { week: "W3", month: monthLabel(0), orders: 390, sales: 9400 },
    { week: "W4", month: monthLabel(0), orders: 150, sales: 3600 },
    { week: "W5", month: monthLabel(1), orders: 310, sales: 7400 },
    { week: "W6", month: monthLabel(1), orders: 540, sales: 13100 },
    { week: "W7", month: monthLabel(1), orders: 460, sales: 10800 },
    { week: "W8", month: monthLabel(1), orders: 200, sales: 4700 },
    { week: "W9", month: monthLabel(2), orders: 130, sales: 3100 },
    { week: "W10", month: monthLabel(2), orders: 420, sales: 10200 },
    { week: "W11", month: monthLabel(2), orders: 510, sales: 12400 },
    { week: "W12", month: monthLabel(2), orders: 350, sales: 8500 },
  ],
  q2: [
    { week: "W1", month: monthLabel(3), orders: 410, sales: 9800 },
    { week: "W2", month: monthLabel(3), orders: 280, sales: 6700 },
    { week: "W3", month: monthLabel(3), orders: 120, sales: 2900 },
    { week: "W4", month: monthLabel(3), orders: 350, sales: 8400 },
    { week: "W5", month: monthLabel(4), orders: 520, sales: 12600 },
    { week: "W6", month: monthLabel(4), orders: 470, sales: 11300 },
    { week: "W7", month: monthLabel(4), orders: 190, sales: 4500 },
    { week: "W8", month: monthLabel(4), orders: 100, sales: 2400 },
    { week: "W9", month: monthLabel(5), orders: 330, sales: 7900 },
    { week: "W10", month: monthLabel(5), orders: 490, sales: 11800 },
    { week: "W11", month: monthLabel(5), orders: 540, sales: 13000 },
    { week: "W12", month: monthLabel(5), orders: 260, sales: 6200 },
  ],
  q3: [
    { week: "W1", month: monthLabel(6), orders: 180, sales: 4200 },
    { week: "W2", month: monthLabel(6), orders: 520, sales: 12800 },
    { week: "W3", month: monthLabel(6), orders: 480, sales: 11500 },
    { week: "W4", month: monthLabel(6), orders: 120, sales: 2800 },
    { week: "W5", month: monthLabel(7), orders: 90, sales: 2100 },
    { week: "W6", month: monthLabel(7), orders: 450, sales: 10500 },
    { week: "W7", month: monthLabel(7), orders: 510, sales: 12200 },
    { week: "W8", month: monthLabel(7), orders: 480, sales: 11000 },
    { week: "W9", month: monthLabel(8), orders: 200, sales: 4800 },
    { week: "W10", month: monthLabel(8), orders: 150, sales: 3500 },
    { week: "W11", month: monthLabel(8), orders: 380, sales: 9200 },
    { week: "W12", month: monthLabel(8), orders: 420, sales: 10100 },
  ],
  q4: [
    { week: "W1", month: monthLabel(9), orders: 300, sales: 7200 },
    { week: "W2", month: monthLabel(9), orders: 160, sales: 3800 },
    { week: "W3", month: monthLabel(9), orders: 440, sales: 10600 },
    { week: "W4", month: monthLabel(9), orders: 530, sales: 12900 },
    { week: "W5", month: monthLabel(10), orders: 380, sales: 9100 },
    { week: "W6", month: monthLabel(10), orders: 140, sales: 3400 },
    { week: "W7", month: monthLabel(10), orders: 250, sales: 6000 },
    { week: "W8", month: monthLabel(10), orders: 500, sales: 12100 },
    { week: "W9", month: monthLabel(11), orders: 550, sales: 13300 },
    { week: "W10", month: monthLabel(11), orders: 470, sales: 11400 },
    { week: "W11", month: monthLabel(11), orders: 210, sales: 5000 },
    { week: "W12", month: monthLabel(11), orders: 340, sales: 8200 },
  ],
};

const pipelineOrdersConfig = {
  orders: { label: "Orders", color: palette.primary },
} satisfies ChartConfig;

const pipelineSalesConfig = {
  sales: { label: "Sales", theme: palette.tertiary },
} satisfies ChartConfig;

const incomeCategoryData = [
  { category: "Electronics", value: 8200 },
  { category: "Clothing", value: 5400 },
  { category: "Home & Garden", value: 3800 },
  { category: "Sports", value: 4100 },
  { category: "Beauty", value: 2900 },
];

const radarChartConfig = {
  value: { label: "Sales", color: palette.primary },
} satisfies ChartConfig;

type HeatmapCell = {
  value: number;
  isCurrentWeek: boolean;
};

type TrafficSource = {
  name: string;
  total: string;
  weeks: HeatmapCell[];
};

const trafficSourcesData: TrafficSource[] = [
  {
    name: "",
    total: "6k",
    weeks: [
      { value: 0, isCurrentWeek: false },
      { value: 0, isCurrentWeek: false },
      { value: 0, isCurrentWeek: false },
      { value: 0, isCurrentWeek: false },
    ],
  },
  {
    name: "Google Ads",
    total: "5k",
    weeks: [
      { value: 0.5, isCurrentWeek: false },
      { value: 0.95, isCurrentWeek: true },
      { value: 0.2, isCurrentWeek: false },
      { value: 0.55, isCurrentWeek: false },
    ],
  },
  {
    name: "Facebook",
    total: "4k",
    weeks: [
      { value: 0.25, isCurrentWeek: false },
      { value: 0.6, isCurrentWeek: false },
      { value: 0.15, isCurrentWeek: false },
      { value: 0.5, isCurrentWeek: false },
    ],
  },
  {
    name: "Organic",
    total: "2k",
    weeks: [
      { value: 0.2, isCurrentWeek: false },
      { value: 0.9, isCurrentWeek: true },
      { value: 0.1, isCurrentWeek: false },
      { value: 0.15, isCurrentWeek: false },
    ],
  },
  {
    name: "Email",
    total: "3k",
    weeks: [
      { value: 0.45, isCurrentWeek: false },
      { value: 0.95, isCurrentWeek: true },
      { value: 0.85, isCurrentWeek: true },
      { value: 0.2, isCurrentWeek: false },
    ],
  },
  {
    name: "Direct",
    total: "4.5k",
    weeks: [
      { value: 0.4, isCurrentWeek: false },
      { value: 0.9, isCurrentWeek: true },
      { value: 0.8, isCurrentWeek: true },
      { value: 0.25, isCurrentWeek: false },
    ],
  },
];

const weekLabels = ["Week 1", "Week 2", "Week 3", "Week 4"];

const orderStatusData = [
  { key: "fulfilled", label: "Fulfilled", value: 3200 },
  { key: "pending", label: "Pending", value: 850 },
];

const orderStatusChartConfig = {
  fulfilled: { label: "Fulfilled", color: palette.primary },
  pending: { label: "Pending", theme: palette.tertiary },
} satisfies ChartConfig;

const invoiceStatuses: InvoiceStatus[] = [
  "Paid",
  "Pending",
  "Overdue",
  "Draft",
];

const INVOICE_PAGE_SIZE_OPTIONS = [5, 10, 20];

const invoices: Invoice[] = [
  {
    id: "1",
    invoiceId: "INV-00001",
    customer: "James Brown",
    customerInitials: "JB",
    date: "2025-01-05",
    amount: 1250.0,
    priority: "High",
    status: "Paid",
  },
  {
    id: "2",
    invoiceId: "INV-00002",
    customer: "Sarah Miller",
    customerInitials: "SM",
    date: "2025-01-08",
    amount: 3420.5,
    priority: "Medium",
    status: "Pending",
  },
  {
    id: "3",
    invoiceId: "INV-00003",
    customer: "Michael Chen",
    customerInitials: "MC",
    date: "2025-01-12",
    amount: 890.0,
    priority: "Low",
    status: "Paid",
  },
  {
    id: "4",
    invoiceId: "INV-00004",
    customer: "Emily Davis",
    customerInitials: "ED",
    date: "2025-01-15",
    amount: 4750.0,
    priority: "High",
    status: "Overdue",
  },
  {
    id: "5",
    invoiceId: "INV-00005",
    customer: "Robert Wilson",
    customerInitials: "RW",
    date: "2025-01-18",
    amount: 567.25,
    priority: "Low",
    status: "Draft",
  },
  {
    id: "6",
    invoiceId: "INV-00006",
    customer: "Lisa Anderson",
    customerInitials: "LA",
    date: "2025-01-22",
    amount: 2100.0,
    priority: "Medium",
    status: "Paid",
  },
  {
    id: "7",
    invoiceId: "INV-00007",
    customer: "David Martinez",
    customerInitials: "DM",
    date: "2025-02-01",
    amount: 1875.75,
    priority: "High",
    status: "Pending",
  },
  {
    id: "8",
    invoiceId: "INV-00008",
    customer: "Jennifer Taylor",
    customerInitials: "JT",
    date: "2025-02-05",
    amount: 45.0,
    priority: "Low",
    status: "Paid",
  },
  {
    id: "9",
    invoiceId: "INV-00009",
    customer: "Chris Thompson",
    customerInitials: "CT",
    date: "2025-02-10",
    amount: 3200.0,
    priority: "Medium",
    status: "Overdue",
  },
  {
    id: "10",
    invoiceId: "INV-00010",
    customer: "Amanda White",
    customerInitials: "AW",
    date: "2025-02-14",
    amount: 980.5,
    priority: "High",
    status: "Pending",
  },
  {
    id: "11",
    invoiceId: "INV-00011",
    customer: "Kevin Harris",
    customerInitials: "KH",
    date: "2025-02-18",
    amount: 4200.0,
    priority: "Medium",
    status: "Paid",
  },
  {
    id: "12",
    invoiceId: "INV-00012",
    customer: "Rachel Clark",
    customerInitials: "RC",
    date: "2025-02-22",
    amount: 1560.0,
    priority: "Low",
    status: "Draft",
  },
  {
    id: "13",
    invoiceId: "INV-00013",
    customer: "Thomas Lewis",
    customerInitials: "TL",
    date: "2025-03-01",
    amount: 2890.0,
    priority: "High",
    status: "Overdue",
  },
  {
    id: "14",
    invoiceId: "INV-00014",
    customer: "Maria Robinson",
    customerInitials: "MR",
    date: "2025-03-05",
    amount: 725.0,
    priority: "Low",
    status: "Paid",
  },
  {
    id: "15",
    invoiceId: "INV-00015",
    customer: "Daniel Walker",
    customerInitials: "DW",
    date: "2025-03-10",
    amount: 5000.0,
    priority: "High",
    status: "Pending",
  },
  {
    id: "16",
    invoiceId: "INV-00016",
    customer: "Sophie Hall",
    customerInitials: "SH",
    date: "2025-03-14",
    amount: 1340.0,
    priority: "Medium",
    status: "Paid",
  },
  {
    id: "17",
    invoiceId: "INV-00017",
    customer: "Nathan Young",
    customerInitials: "NY",
    date: "2025-03-18",
    amount: 2675.5,
    priority: "Medium",
    status: "Draft",
  },
  {
    id: "18",
    invoiceId: "INV-00018",
    customer: "Olivia King",
    customerInitials: "OK",
    date: "2025-03-22",
    amount: 460.0,
    priority: "Low",
    status: "Pending",
  },
];

const badgeClassName =
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

const invoiceStatusStyles: Record<InvoiceStatus, string> = {
  Paid: "ring-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
  Pending:
    "ring-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  Overdue:
    "ring-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
  Draft: "ring-border text-muted-foreground bg-muted",
};

const invoicePriorityStyles: Record<InvoicePriority, string> = {
  High: "ring-red-500/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
  Medium:
    "ring-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  Low: "ring-border text-muted-foreground bg-muted",
};

const SidebarLogo = ({ logo }: { logo: SidebarData["logo"] }) => {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip={logo.title}>
          <div className="flex aspect-square size-8 items-center justify-center rounded-sm bg-primary">
            <img
              src={logo.src}
              alt={logo.alt}
              width={24}
              height={24}
              className="size-6 text-primary-foreground invert dark:invert-0"
            />
          </div>
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-medium">{logo.title}</span>
            <span className="text-xs text-muted-foreground">
              {logo.description}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const NavMenuItem = ({ item }: { item: NavItem }) => {
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;

  if (!hasChildren) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={item.isActive}
          tooltip={item.label}
        >
          <a href={item.href}>
            <Icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild defaultOpen className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={item.isActive} tooltip={item.label}>
            <Icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
            <ChevronRight
              className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
              aria-hidden="true"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children!.map((child) => (
              <SidebarMenuSubItem key={child.label}>
                <SidebarMenuSubButton asChild isActive={child.isActive}>
                  <a href={child.href}>{child.label}</a>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
};

const NavUser = ({ user }: { user: UserData }) => {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side="bottom"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 size-4" aria-hidden="true" />
              Account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="mr-2 size-4" aria-hidden="true" />
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const AppSidebar = ({ ...props }: React.ComponentProps<typeof Sidebar>) => {
  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
          <SidebarLogo logo={sidebarData.logo} />
          <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:ml-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavMenuItem key={item.label} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        {sidebarData.user && <NavUser user={sidebarData.user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

const DashboardHeader = () => {
  return (
    <header className="flex w-full items-center gap-3 border-b bg-background px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-base font-medium text-pretty">
          Dashboard Overview
        </h1>
        <p className="hidden text-xs text-muted-foreground sm:block">
          A summary for all the purchases, sales etc.
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground lg:inline">
          {dashboardDateRangeLabel}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label="All Platforms"
        >
          <Globe className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">All Platforms</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label="All Products"
        >
          <span className="hidden sm:inline">All Products</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label="Export"
        >
          <Download className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Notifications"
        >
          <Bell className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Help"
        >
          <HelpCircle className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
};

const AccountingStatsCards = () => {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {richMetricStats.map((stat) => {
        const isPositive = stat.trendValue > 0;
        const isNeutral = stat.trendValue === 0;

        const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

        const deltaPrefix =
          stat.footerDelta > 0 ? "+" : stat.footerDelta < 0 ? "-" : "";
        const footerLabel = `${deltaPrefix}${currencyFormatter.format(
          Math.abs(stat.footerDelta),
        )} vs last month`;
        const footerSubtext = `Based on ${numberFormatter.format(
          stat.footerSubtextCount,
        )} orders`;

        return (
          <Card key={stat.title} className="@container/card shadow-none">
            <CardHeader>
              <CardDescription className="font-medium">
                {stat.title}
              </CardDescription>
              <CardTitle className="text-2xl font-bold @[600px]/card:text-4xl @[800px]/card:text-5xl">
                {currencyFormatter.format(stat.value)}
              </CardTitle>
            </CardHeader>

            <CardFooter className="flex-col items-start gap-1 text-sm">
              <div className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                <span
                  className={
                    isNeutral
                      ? ""
                      : isPositive
                        ? "text-green-600"
                        : "text-destructive"
                  }
                >
                  {footerLabel}
                </span>
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    isNeutral
                      ? "text-muted-foreground"
                      : isPositive
                        ? "text-green-600"
                        : "text-destructive",
                  )}
                  aria-hidden="true"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {footerSubtext}
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
};

const RevenueChartTooltip = ({
  active,
  payload,
  label,
}: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null;

  const revenue = payload.find((p) => p.dataKey === "revenue")?.value ?? 0;
  const expenses = payload.find((p) => p.dataKey === "expenses")?.value ?? 0;
  const total = Number(revenue) + Number(expenses);

  return (
    <div className="rounded-lg border border-border bg-popover p-2 shadow-lg sm:p-3">
      <p className="mb-1.5 text-xs font-medium text-foreground sm:mb-2 sm:text-sm">
        {label}
      </p>
      <div className="space-y-1 sm:space-y-1.5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className="size-2 rounded-full sm:size-2.5"
            style={{ backgroundColor: "var(--color-revenue)" }}
          />
          <span className="text-[10px] text-muted-foreground sm:text-sm">
            Revenue:
          </span>
          <span className="text-[10px] font-medium text-foreground sm:text-sm">
            {currencyFormatter.format(Number(revenue))}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className="size-2 rounded-full sm:size-2.5"
            style={{ backgroundColor: "var(--color-expenses)" }}
          />
          <span className="text-[10px] text-muted-foreground sm:text-sm">
            Expenses:
          </span>
          <span className="text-[10px] font-medium text-foreground sm:text-sm">
            {currencyFormatter.format(Number(expenses))}
          </span>
        </div>
        <div className="mt-1 border-t border-border pt-1">
          <span className="text-[10px] font-medium text-foreground sm:text-xs">
            Total: {currencyFormatter.format(total)}
          </span>
        </div>
      </div>
    </div>
  );
};

const RevenueChart = () => {
  const totalRevenue = weeklyRevenueData.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-7 sm:size-8"
            aria-label="Revenue"
          >
            <BarChart3
              className="size-4 text-muted-foreground sm:size-4.5"
              aria-hidden="true"
            />
          </Button>
          <h2 className="text-sm font-medium text-pretty sm:text-base">
            Revenue
          </h2>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="flex items-center gap-1.5">
            <div
              className="size-2 rounded-full sm:size-2.5"
              style={{ backgroundColor: palette.primary }}
            />
            <span className="text-[10px] text-muted-foreground sm:text-xs">
              Revenue
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="size-2 rounded-full sm:size-2.5"
              style={{ backgroundColor: palette.secondary.light }}
            />
            <span className="text-[10px] text-muted-foreground sm:text-xs">
              Expenses
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="flex flex-col gap-1">
          <p className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
            {currencyFormatter.format(totalRevenue)}
          </p>
          <p className="text-[10px] tracking-wider text-muted-foreground uppercase sm:text-xs">
            This week vs last week
          </p>
        </div>

        <div className="h-[180px] w-full min-w-0 sm:h-[220px]">
          <ChartContainer config={revenueChartConfig} className="h-full w-full">
            <BarChart data={weeklyRevenueData}>
              <CartesianGrid strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                dx={-5}
                tickFormatter={(value) =>
                  compactCurrencyFormatter.format(value)
                }
                width={40}
              />
              <Tooltip
                content={<RevenueChartTooltip />}
                cursor={{ fillOpacity: 0.05 }}
              />
              <Bar
                dataKey="revenue"
                stackId="revenue"
                fill="var(--color-revenue)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="expenses"
                stackId="revenue"
                fill="var(--color-expenses)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
};

const SalesPipelineChart = () => {
  const [searchParams, setSearchParams] = React.useState(
    () =>
      new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      ),
  );

  const quarter = searchParams.get("quarter") ?? "q3";

  const handleQuarterChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("quarter", value);
    setSearchParams(next);
    window.history.replaceState(null, "", `?${next.toString()}`);
  };

  const data = salesPipelineData[quarter] ?? salesPipelineData.q3;
  const totalOrders = data.reduce((sum, d) => sum + d.orders, 0);
  const totalSales = data.reduce((sum, d) => sum + d.sales, 0);

  const pipelineLabelFormatter = (
    value: React.ReactNode,
    payload: Array<{ payload?: { week?: string } }> | undefined,
  ) => {
    const week = payload?.[0]?.payload?.week;
    if (!week) return value;
    return `${value} · ${week}`;
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-7 sm:size-8"
            aria-label="Sales Pipeline"
          >
            <BarChart3
              className="size-4 text-muted-foreground sm:size-4.5"
              aria-hidden="true"
            />
          </Button>
          <h2 className="text-sm font-medium text-pretty sm:text-base">
            Sales Pipeline
          </h2>
        </div>

        <Select value={quarter} onValueChange={handleQuarterChange}>
          <SelectTrigger
            className="h-7 w-[120px] text-xs"
            aria-label="Select quarter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="q1">Quarter 1</SelectItem>
            <SelectItem value="q2">Quarter 2</SelectItem>
            <SelectItem value="q3">Quarter 3</SelectItem>
            <SelectItem value="q4">Quarter 4</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-[1fr_auto_1fr] sm:p-5">
        <div className="flex min-h-0 flex-col gap-2">
          <div>
            <p className="text-lg font-semibold tracking-tight">
              {numberFormatter.format(totalOrders)}
            </p>
            <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
              Total Orders
            </p>
          </div>
          <div className="min-h-0 w-full flex-1">
            <ChartContainer
              config={pipelineOrdersConfig}
              className="h-full w-full"
            >
              <AreaChart data={data} accessibilityLayer>
                <defs>
                  <linearGradient
                    id="pipelineGradientOrders"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-orders)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-orders)"
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  interval={3}
                  dy={4}
                />
                <YAxis hide domain={["dataMin - 50", "dataMax + 50"]} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={pipelineLabelFormatter}
                      formatter={(value, name) => {
                        const numericValue = Number(value);
                        const formatted = numberFormatter.format(
                          Number.isFinite(numericValue) ? numericValue : 0,
                        );

                        return (
                          <div className="flex w-full items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{
                                backgroundColor:
                                  name === "orders"
                                    ? "var(--color-orders)"
                                    : "var(--color-sales)",
                              }}
                            />
                            <span className="text-muted-foreground">
                              Orders
                            </span>
                            <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                              {formatted}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Area
                  type="step"
                  dataKey="orders"
                  stroke="var(--color-orders)"
                  strokeWidth={2}
                  fill="url(#pipelineGradientOrders)"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        </div>

        <div className="h-px w-full bg-border sm:h-auto sm:w-px sm:self-stretch" />

        <div className="flex min-h-0 flex-col gap-2">
          <div>
            <p className="text-lg font-semibold tracking-tight">
              {compactCurrencyOneDecimalFormatter.format(totalSales)}
            </p>
            <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
              Total Sales
            </p>
          </div>
          <div className="min-h-0 w-full flex-1">
            <ChartContainer
              config={pipelineSalesConfig}
              className="h-full w-full"
            >
              <AreaChart data={data} accessibilityLayer>
                <defs>
                  <linearGradient
                    id="pipelineGradientSales"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-sales)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-sales)"
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  interval={3}
                  dy={4}
                />
                <YAxis hide domain={["dataMin - 50", "dataMax + 50"]} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={pipelineLabelFormatter}
                      formatter={(value, name) => {
                        const numericValue = Number(value);
                        const formatted = currencyFormatter.format(
                          Number.isFinite(numericValue) ? numericValue : 0,
                        );

                        return (
                          <div className="flex w-full items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{
                                backgroundColor:
                                  name === "orders"
                                    ? "var(--color-orders)"
                                    : "var(--color-sales)",
                              }}
                            />
                            <span className="text-muted-foreground">Sales</span>
                            <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                              {formatted}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Area
                  type="step"
                  dataKey="sales"
                  stroke="var(--color-sales)"
                  strokeWidth={2}
                  fill="url(#pipelineGradientSales)"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const IncomeByCategoryChart = () => {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <Button
          variant="outline"
          size="icon"
          className="size-7 sm:size-8"
          aria-label="Sales by Category"
        >
          <Grid3x3
            className="size-4 text-muted-foreground sm:size-4.5"
            aria-hidden="true"
          />
        </Button>
        <h2 className="text-sm font-medium text-pretty sm:text-base">
          Sales by Category
        </h2>
      </div>

      <div className="mx-auto aspect-square max-h-[250px] w-full">
        <ChartContainer config={radarChartConfig} className="h-full w-full">
          <RadarChart data={incomeCategoryData}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <PolarAngleAxis dataKey="category" tick={{ fontSize: 11 }} />
            <PolarGrid />
            <Radar
              dataKey="value"
              fill="var(--color-value)"
              fillOpacity={0.5}
              stroke="var(--color-value)"
              strokeWidth={2}
            />
          </RadarChart>
        </ChartContainer>
      </div>
    </div>
  );
};

const TrafficSourcesHeatmap = () => {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl border bg-card">
      <div className="flex h-14 items-center justify-between px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-7 sm:size-8"
            aria-label="Traffic Sources"
          >
            <Grid3x3
              className="size-4 text-muted-foreground sm:size-4.5"
              aria-hidden="true"
            />
          </Button>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-pretty sm:text-base">
              Traffic Sources
            </h2>
            <span className="text-xs font-medium text-green-600">+30%</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full bg-primary" />
            <span className="text-[10px] text-muted-foreground sm:text-xs">
              High
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full bg-primary/40" />
            <span className="text-[10px] text-muted-foreground sm:text-xs">
              Medium
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full bg-primary/15" />
            <span className="text-[10px] text-muted-foreground sm:text-xs">
              Low
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-0.5 sm:gap-1">
          {trafficSourcesData.map((source) => (
            <React.Fragment key={source.name}>
              <div className="flex items-center pr-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {source.total}
                </span>
              </div>
              {source.weeks.map((cell, weekIndex) => {
                const intensity = cell.isCurrentWeek
                  ? Math.round(cell.value * 30 + 65)
                  : Math.round(cell.value * 35 + 15);
                const tooltipTitle = source.name || "Total";
                const weekLabel =
                  weekLabels[weekIndex] ?? `Week ${weekIndex + 1}`;
                const strength = Math.round(cell.value * 100);

                return (
                  <ShadTooltipProvider key={weekIndex}>
                    <ShadTooltip>
                      <ShadTooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-5 w-full rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-6"
                          style={{
                            backgroundColor: `color-mix(in oklch, var(--primary) ${intensity}%, ${mixBase})`,
                          }}
                          aria-label={`${tooltipTitle} ${weekLabel}: ${strength}%`}
                        />
                      </ShadTooltipTrigger>
                      <ShadTooltipContent side="top" sideOffset={8}>
                        <div className="grid gap-1">
                          <div className="font-medium">{tooltipTitle}</div>
                          <div className="text-muted-foreground">
                            {weekLabel}
                            {cell.isCurrentWeek ? " · Current" : ""}
                          </div>
                          <div className="tabular-nums">{strength}%</div>
                        </div>
                      </ShadTooltipContent>
                    </ShadTooltip>
                  </ShadTooltipProvider>
                );
              })}
            </React.Fragment>
          ))}

          <div className="pt-2" />
          {weekLabels.map((label) => (
            <div
              key={label}
              className="pt-2 text-center text-[10px] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const OrderStatusChart = () => {
  const total = orderStatusData.reduce((sum, d) => sum + d.value, 0);
  const sliceColors = [palette.primary, palette.tertiary.light];
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <Button
          variant="outline"
          size="icon"
          className="size-7 sm:size-8"
          aria-label="Order Status"
        >
          <Users
            className="size-4 text-muted-foreground sm:size-4.5"
            aria-hidden="true"
          />
        </Button>
        <h2 className="text-sm font-medium text-pretty sm:text-base">
          Order Status
        </h2>
      </div>

      <div className="relative mx-auto w-full max-w-[220px] sm:max-w-[240px]">
        <ChartContainer
          config={orderStatusChartConfig}
          className="aspect-square w-full"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={orderStatusData}
              dataKey="value"
              nameKey="key"
              innerRadius="60%"
              outerRadius="85%"
              paddingAngle={2}
              strokeWidth={0}
              activeIndex={activeIndex ?? undefined}
              activeShape={({
                outerRadius = 0,
                ...props
              }: PieSectorDataItem) => (
                <Sector {...props} outerRadius={outerRadius + 8} />
              )}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={(_, index) =>
                setActiveIndex((current) => (current === index ? null : index))
              }
            >
              {orderStatusData.map((entry, index) => (
                <Cell
                  key={entry.key}
                  fill={sliceColors[index]}
                  fillOpacity={
                    activeIndex !== null && activeIndex !== index ? 0.4 : 1
                  }
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
            Orders
          </span>
          <span className="text-lg font-semibold">
            {numberFormatter.format(total)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6">
        {orderStatusData.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-md px-1 py-0.5 transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none",
              activeIndex !== null && activeIndex !== index && "opacity-50",
            )}
            onPointerEnter={() => setActiveIndex(index)}
            onPointerLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(index)}
            onBlur={() => setActiveIndex(null)}
            onClick={() =>
              setActiveIndex((current) => (current === index ? null : index))
            }
            aria-label={`${item.label}: ${numberFormatter.format(item.value)} orders`}
          >
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: sliceColors[index] }}
            />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const RecentInvoicesTable = () => {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(5);
  const [sortKey, setSortKey] = React.useState<InvoiceSortKey | "">("");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [isHydrated, setIsHydrated] = React.useState(false);
  const skipNextReset = React.useRef(true);

  const hasActiveFilters = statusFilter !== "all";

  const clearFilters = () => {
    setStatusFilter("all");
  };

  // Hydrate from URL params on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get("invoiceStatus");
    const pageParam = Number.parseInt(params.get("page") ?? "", 10);
    const pageSizeParam = Number.parseInt(params.get("pageSize") ?? "", 10);
    const sortKeyParam = params.get("sortKey") as InvoiceSortKey | null;
    const sortDirParam = params.get("sortDir");

    setSearchQuery(params.get("q") ?? "");
    setStatusFilter(
      statusParam && invoiceStatuses.includes(statusParam as InvoiceStatus)
        ? statusParam
        : "all",
    );
    setCurrentPage(Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1);
    setPageSize(
      INVOICE_PAGE_SIZE_OPTIONS.includes(pageSizeParam) ? pageSizeParam : 5,
    );
    if (
      sortKeyParam &&
      ["customer", "invoiceId", "date", "amount"].includes(sortKeyParam)
    ) {
      setSortKey(sortKeyParam);
      setSortDir(sortDirParam === "desc" ? "desc" : "asc");
    }
    setIsHydrated(true);
  }, []);

  // Reset page to 1 when filters change
  React.useEffect(() => {
    if (!isHydrated) return;
    if (skipNextReset.current) {
      skipNextReset.current = false;
      return;
    }
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize, isHydrated]);

  // Sync state to URL
  React.useEffect(() => {
    if (!isHydrated) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    if (searchQuery) {
      params.set("q", searchQuery);
    } else {
      params.delete("q");
    }

    if (statusFilter !== "all") {
      params.set("invoiceStatus", statusFilter);
    } else {
      params.delete("invoiceStatus");
    }

    if (currentPage > 1) {
      params.set("page", String(currentPage));
    } else {
      params.delete("page");
    }

    if (pageSize !== INVOICE_PAGE_SIZE_OPTIONS[0]) {
      params.set("pageSize", String(pageSize));
    } else {
      params.delete("pageSize");
    }

    if (sortKey) {
      params.set("sortKey", sortKey);
      params.set("sortDir", sortDir);
    } else {
      params.delete("sortKey");
      params.delete("sortDir");
    }

    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [
    searchQuery,
    statusFilter,
    currentPage,
    pageSize,
    sortKey,
    sortDir,
    isHydrated,
  ]);

  const handleSort = (key: InvoiceSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredInvoices = React.useMemo(() => {
    return invoices.filter((invoice) => {
      const matchesSearch =
        invoice.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        invoice.invoiceId.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || invoice.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, statusFilter]);

  const sortedInvoices = React.useMemo(() => {
    if (!sortKey) return filteredInvoices;

    return [...filteredInvoices].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "customer":
          cmp = a.customer.localeCompare(b.customer);
          break;
        case "invoiceId":
          cmp = a.invoiceId.localeCompare(b.invoiceId);
          break;
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filteredInvoices, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize));

  const paginatedInvoices = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedInvoices.slice(startIndex, startIndex + pageSize);
  }, [sortedInvoices, currentPage, pageSize]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const sortableHeader = (
    label: string,
    key: InvoiceSortKey,
    className?: string,
  ) => (
    <TableHead
      className={cn(
        "text-xs font-medium text-muted-foreground sm:text-sm",
        className,
      )}
      aria-sort={
        sortKey === key
          ? sortDir === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1"
        onClick={() => handleSort(key)}
      >
        {label}
        <ArrowUpDown
          className="size-3 text-muted-foreground/60"
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );

  return (
    <div>
      <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:py-3.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-medium text-pretty sm:text-base">
              Recent Orders
            </h2>
            <span className="ml-1 inline-flex items-center rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-border ring-inset sm:text-xs">
              {sortedInvoices.length}
            </span>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Display the recent invoices in the table below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Search invoices… (e.g., INV-00012)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              name="invoice-search"
              inputMode="search"
              autoComplete="off"
              aria-label="Search invoices"
              className="h-8 w-full pr-12 pl-9 text-sm sm:h-9 sm:w-[180px] lg:w-[220px]"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground select-none sm:inline-block">
              ⌘1
            </kbd>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 sm:h-9 sm:gap-2",
                  hasActiveFilters && "border-primary",
                )}
                aria-label="Filter invoices"
              >
                <Filter className="size-3.5 sm:size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Filter</span>
                {hasActiveFilters && (
                  <span className="size-1.5 rounded-full bg-primary sm:size-2" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={statusFilter === "all"}
                onCheckedChange={() => setStatusFilter("all")}
              >
                All Statuses
              </DropdownMenuCheckboxItem>
              {invoiceStatuses.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilter === status}
                  onCheckedChange={() => setStatusFilter(status)}
                >
                  {status}
                </DropdownMenuCheckboxItem>
              ))}

              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={clearFilters}
                    className="text-destructive"
                  >
                    <X className="mr-2 size-4" aria-hidden="true" />
                    Clear filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs sm:h-9 sm:text-sm"
          >
            See All
          </Button>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <span className="text-[10px] text-muted-foreground sm:text-xs">
            Filters:
          </span>
          {statusFilter !== "all" && (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-border ring-inset sm:text-xs"
              onClick={() => setStatusFilter("all")}
              aria-label={`Clear ${statusFilter} filter`}
            >
              {statusFilter}
              <X className="size-2.5 sm:size-3" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto pb-3 sm:pb-4">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {sortableHeader("Customer", "customer", "min-w-[160px]")}
              {sortableHeader("Invoice ID", "invoiceId", "min-w-[120px]")}
              {sortableHeader(
                "Date",
                "date",
                "hidden min-w-[100px] sm:table-cell",
              )}
              {sortableHeader("Amount", "amount", "min-w-[90px]")}
              <TableHead className="min-w-[80px] text-xs font-medium text-muted-foreground sm:text-sm">
                Priority
              </TableHead>
              <TableHead className="min-w-[80px] text-xs font-medium text-muted-foreground sm:text-sm">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedInvoices.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No invoices found matching your filters.
                </TableCell>
              </TableRow>
            ) : (
              paginatedInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">
                          {invoice.customerInitials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium sm:text-sm">
                        {invoice.customer}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums sm:text-sm">
                    {invoice.invoiceId}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell sm:text-sm">
                    {invoiceDateFormatter.format(new Date(invoice.date))}
                  </TableCell>
                  <TableCell className="text-xs font-medium text-foreground tabular-nums sm:text-sm">
                    {currencyFormatter.format(invoice.amount)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        badgeClassName,
                        invoicePriorityStyles[invoice.priority],
                      )}
                    >
                      {invoice.priority}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        badgeClassName,
                        invoiceStatusStyles[invoice.status],
                      )}
                    >
                      {invoice.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t py-3 sm:flex-row">
        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <span className="hidden sm:inline">Rows per page:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVOICE_PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">
            {sortedInvoices.length === 0
              ? "0 of 0"
              : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, sortedInvoices.length)} of ${sortedInvoices.length}`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            aria-label="Go to first page"
          >
            <ChevronsLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>

          <div className="flex items-center gap-1 px-2">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "ghost"}
                  size="icon"
                  className="size-8"
                  onClick={() => goToPage(pageNum)}
                  aria-label={`Go to page ${pageNum}`}
                  aria-current={currentPage === pageNum ? "page" : undefined}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Go to next page"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            aria-label="Go to last page"
          >
            <ChevronsRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const DashboardContent = () => {
  return (
    <main
      id="dashboard-main"
      tabIndex={-1}
      className="w-full flex-1 space-y-4 overflow-auto bg-background p-3 sm:space-y-6 sm:p-4 md:p-6"
    >
      <AccountingStatsCards />

      <div className="flex flex-col gap-4 sm:gap-6 xl:flex-row">
        <RevenueChart />
        <SalesPipelineChart />
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <IncomeByCategoryChart />
        <TrafficSourcesHeatmap />
        <OrderStatusChart />
      </div>
      <RecentInvoicesTable />
    </main>
  );
};

const Dashboard8 = ({ className }: { className?: string }) => {
  return (
    <ShadTooltipProvider>
      <SidebarProvider className={cn("bg-sidebar", className)}>
        <a
          href="#dashboard-main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:ring-2 focus:ring-ring"
        >
          Skip to main content
        </a>
        <AppSidebar />
        <div className="h-svh w-full overflow-hidden lg:p-2">
          <div className="flex h-full w-full flex-col items-center justify-start overflow-hidden bg-background lg:rounded-xl lg:border">
            <DashboardHeader />
            <DashboardContent />
          </div>
        </div>
      </SidebarProvider>
    </ShadTooltipProvider>
  );
};

export { Dashboard8 };
