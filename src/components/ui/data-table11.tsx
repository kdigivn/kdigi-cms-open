/* eslint-disable */
"use client";

import type {
  ColumnFiltersState,
  RowSelectionState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  type Table as TableType,
  useReactTable,
} from "@tanstack/react-table";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Download,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
type UseDataTableOptions<TData> = {
  data: Array<TData>;
  columns: Array<ColumnDef<TData, unknown>>;
  getRowId?: (row: TData) => string;
  initialSorting?: SortingState;
  initialGlobalFilter?: string;
  initialFilters?: ColumnFiltersState;
  initialVisibility?: VisibilityState;
  initialSelection?: RowSelectionState;
  enableRowSelection?: boolean;
};

export function useDataTable<TData>(options: UseDataTableOptions<TData>) {
  const {
    data,
    columns,
    getRowId,
    initialSorting = [],
    initialFilters = [],
    initialGlobalFilter = "",
    initialVisibility = {},
    initialSelection = {},
    enableRowSelection = true,
  } = options;

  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>(initialFilters);
  const [globalFilter, setGlobalFilter] =
    React.useState<string>(initialGlobalFilter);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialVisibility);
  const [rowSelection, setRowSelection] =
    React.useState<RowSelectionState>(initialSelection);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    enableRowSelection,
  });

  return {
    table,
    columnFilters,
    setColumnFilters,
    sorting,
    setSorting,
    globalFilter,
    setGlobalFilter,
    columnVisibility,
    setColumnVisibility,
    rowSelection,
    setRowSelection,
  };
}

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>;
  title: string;
};

export const DataTableColumnHeader = <TData, TValue>({
  column,
  title,
}: DataTableColumnHeaderProps<TData, TValue>) => {
  const canSort = column.getCanSort();
  const sorted = column.getIsSorted();

  if (!canSort) {
    return (
      <span className="flex h-8 items-center text-sm font-medium text-foreground">
        {title}
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex h-8 items-center gap-2 px-0 text-sm font-medium text-foreground"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      <span>{title}</span>
      {sorted === "desc" ? (
        <ArrowDown className="h-4 w-4" />
      ) : sorted === "asc" ? (
        <ArrowUp className="h-4 w-4" />
      ) : (
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      )}
    </Button>
  );
};

type DataTablePaginationProps<TData> = {
  table: TableType<TData>;
  pageSizeOptions?: number[];
};

export const DataTablePagination = <TData,>({
  table,
  pageSizeOptions = [10, 20, 30, 40, 50],
}: DataTablePaginationProps<TData>) => {
  const currentPage = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalRows = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();

  const startRow = currentPage * pageSize + 1;
  const endRow = Math.min((currentPage + 1) * pageSize, totalRows);

  const relevantPageSizes = pageSizeOptions.filter(
    (size) => size <= totalRows || size === pageSize,
  );

  return (
    <div className="flex flex-col gap-4 px-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 text-center text-sm text-muted-foreground sm:text-left">
        <span className="font-medium">
          {totalRows === 0 ? (
            "No results"
          ) : (
            <>
              Showing {startRow} to {endRow} of {totalRows}{" "}
              {totalRows === 1 ? "row" : "rows"}
            </>
          )}
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium whitespace-nowrap">Rows per page</p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
            disabled={totalRows === 0}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {relevantPageSizes.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm font-medium whitespace-nowrap">
            Page {currentPage + 1} of {pageCount}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="hidden size-8 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={currentPage === 0 || totalRows === 0}
              aria-label="Go to first page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Go to previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Go to next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="hidden size-8 lg:flex"
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={currentPage === pageCount - 1 || totalRows === 0}
              aria-label="Go to last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DataTableViewOptionsProps<TData> {
  table: TableType<TData>;
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const columns = table.getAllColumns().filter((column) => column.getCanHide());

  const hiddenCount = columns.filter((col) => !col.getIsVisible()).length;
  const hasHiddenColumns = hiddenCount > 0;

  const handleResetColumns = () => {
    table.resetColumnVisibility();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">View</span>
          {hasHiddenColumns && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 w-5 rounded-full p-0 text-xs"
            >
              {hiddenCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Toggle columns</span>
          {hasHiddenColumns && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetColumns}
              className="h-auto p-1 text-xs"
            >
              Reset
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No columns available
          </div>
        ) : (
          columns.map((column) => {
            // Get label from meta or fallback to formatted column.id
            const label =
              (column.columnDef.meta as { label?: string })?.label ||
              column.id.charAt(0).toUpperCase() +
                column.id.slice(1).replace(/([A-Z])/g, " $1");

            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                className="capitalize"
              >
                {label}
              </DropdownMenuCheckboxItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface DataTableActionBarProps<TData> extends React.ComponentProps<
  typeof motion.div
> {
  table: TableType<TData>;
  visible?: boolean;
  container?: Element | DocumentFragment | null;
  position?: "top" | "bottom"; // Add this prop
}

function DataTableActionBar<TData>({
  table,
  visible: visibleProp,
  container: containerProp,
  position = "bottom",
  children,
  className,
  ...props
}: DataTableActionBarProps<TData>) {
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        table.toggleAllRowsSelected(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [table]);

  const container =
    containerProp ?? (mounted ? globalThis.document?.body : null);

  if (!container) return null;

  const visible =
    visibleProp ?? table.getFilteredSelectedRowModel().rows.length > 0;

  const variants = {
    top: {
      position: "top-12",
      animation: {
        initial: { opacity: 0, y: -20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -20 },
      },
      extraClasses: "shadow-sm",
    },
    bottom: {
      position: "bottom-6",
      animation: {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 20 },
      },
      extraClasses: "shadow-sm",
    },
  };

  const currentVariant = variants[position];

  return ReactDOM.createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          role="toolbar"
          aria-orientation="horizontal"
          initial={currentVariant.animation.initial}
          animate={currentVariant.animation.animate}
          exit={currentVariant.animation.exit}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={cn(
            "fixed inset-x-0 z-50 mx-auto flex w-fit flex-wrap items-center justify-center gap-2 rounded-lg border bg-background p-2 text-foreground",
            currentVariant.position,
            currentVariant.extraClasses,
            className,
          )}
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    container,
  );
}

interface DataTableActionBarActionProps extends React.ComponentProps<
  typeof Button
> {
  tooltip?: string;
  isPending?: boolean;
}

function DataTableActionBarAction({
  size = "sm",
  tooltip,
  isPending,
  disabled,
  className,
  children,
  ...props
}: DataTableActionBarActionProps) {
  const trigger = (
    <Button
      variant="secondary"
      size={size}
      className={cn(
        "gap-2 border [&>svg]:size-3.5",
        size === "icon" ? "size-7" : "h-7",
        className,
      )}
      disabled={disabled || isPending}
      {...props}
    >
      {isPending ? <Spinner /> : children}
    </Button>
  );

  if (!tooltip) return trigger;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          sideOffset={6}
          className="border bg-popover font-semibold text-popover-foreground [&>span]:hidden"
        >
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface DataTableActionBarSelectionProps<TData> {
  table: TableType<TData>;
}

function DataTableActionBarSelection<TData>({
  table,
}: DataTableActionBarSelectionProps<TData>) {
  const onClearSelection = React.useCallback(() => {
    table.toggleAllRowsSelected(false);
  }, [table]);

  return (
    <div className="flex h-7 items-center rounded-md border pr-1 pl-2.5">
      <span className="text-xs whitespace-nowrap">
        {table.getFilteredSelectedRowModel().rows.length} selected
      </span>
      <Separator
        orientation="vertical"
        className="mr-1 ml-2 data-[orientation=vertical]:h-4"
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={onClearSelection}
            >
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            sideOffset={10}
            className="flex items-center gap-2 border bg-popover px-2 py-1 font-semibold text-popover-foreground [&>span]:hidden"
          >
            <p>Clear selection</p>
            <kbd className="rounded border bg-background px-1.5 py-px font-mono text-[0.7rem] font-normal text-foreground shadow-xs select-none">
              <abbr title="Escape" className="no-underline">
                Esc
              </abbr>
            </kbd>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

interface DataTableToolbarProps<TData> extends React.ComponentProps<"div"> {
  table: TableType<TData>;
  showViewOptions?: boolean;
}

export const DataTableToolbar = <TData,>({
  table,
  children,
  className,
  showViewOptions = true,
  ...props
}: DataTableToolbarProps<TData>) => {
  return (
    <div
      className={cn(
        "flex flex-row items-center justify-between gap-2 py-4",
        className,
      )}
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      <div>{showViewOptions && <DataTableViewOptions table={table} />}</div>
    </div>
  );
};

export const schema = z.object({
  id: z.string(),
  item: z.string(),
  type: z.string(),
  stock: z.boolean(),
  sku: z.string(),
  price: z.number(),
  availability: z.array(z.enum(["In store", "Online"])),
});

const data = [
  {
    id: "prod-001",
    item: "Tablet Case",
    type: "Electronics",
    stock: true,
    sku: "TC-001",
    price: 83.24,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-002",
    item: "Smart Watch",
    type: "Electronics",
    stock: true,
    sku: "SW-002",
    price: 246.27,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-003",
    item: "Wool Sweater",
    type: "Accessories",
    stock: true,
    sku: "WS-003",
    price: 168.27,
    availability: ["In store"],
  },
  {
    id: "prod-004",
    item: "Wireless Earbuds",
    type: "Electronics",
    stock: true,
    sku: "WE-004",
    price: 107.75,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-005",
    item: "Laptop Sleeve",
    type: "Electronics",
    stock: true,
    sku: "LS-005",
    price: 248.02,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-006",
    item: "Running Shoes",
    type: "Footwear",
    stock: true,
    sku: "RS-006",
    price: 208.26,
    availability: ["In store"],
  },
  {
    id: "prod-007",
    item: "Winter Jacket",
    type: "Clothing",
    stock: true,
    sku: "WJ-007",
    price: 148.06,
    availability: ["In store"],
  },
  {
    id: "prod-008",
    item: "Phone Case",
    type: "Accessories",
    stock: true,
    sku: "PC-008",
    price: 298.08,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-009",
    item: "Fitness Tracker",
    type: "Clothing",
    stock: true,
    sku: "FT-009",
    price: 222.09,
    availability: ["In store"],
  },
  {
    id: "prod-010",
    item: "Sunglasses",
    type: "Accessories",
    stock: true,
    sku: "SG-010",
    price: 60.17,
    availability: ["In store"],
  },
  {
    id: "prod-011",
    item: "Casual Boots",
    type: "Shoes",
    stock: true,
    sku: "CB-011",
    price: 276.15,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-012",
    item: "High Heels",
    type: "Clothing",
    stock: true,
    sku: "HH-012",
    price: 85.47,
    availability: ["In store"],
  },
  {
    id: "prod-013",
    item: "Beach Sandals",
    type: "Footwear",
    stock: true,
    sku: "BS-013",
    price: 41.25,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-014",
    item: "Gold Necklace",
    type: "Accessories",
    stock: true,
    sku: "GN-014",
    price: 201.47,
    availability: ["In store", "Online"],
  },
  {
    id: "prod-015",
    item: "Bluetooth Speaker",
    type: "Electronics",
    stock: true,
    sku: "BS-015",
    price: 297.37,
    availability: ["In store", "Online"],
  },
];

export const validatedData = schema.array().parse(data);

export const columns: ColumnDef<z.infer<typeof schema>>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "sku",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="SKU" />
    ),
    enableSorting: true,
    enableHiding: true,
    meta: {
      label: "SKU",
    },
  },
  {
    accessorKey: "item",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Item" />
    ),
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("item")}</div>
    ),
    enableSorting: true,
    enableHiding: false,
    meta: {
      label: "Product Name",
    },
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    enableSorting: true,
    enableHiding: true,
    meta: {
      label: "Category",
    },
  },
  {
    accessorKey: "stock",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="In Stock" />
    ),
    cell: ({ row }) => {
      const inStock: boolean = row.getValue("stock");
      return inStock ? "Yes" : "No";
    },
    enableSorting: false,
    enableHiding: true,
    meta: {
      label: "Stock Status",
    },
  },
  {
    accessorKey: "price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Price" />
    ),
    cell: ({ row }) => {
      const price = parseFloat(row.getValue("price"));
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(price);
      return <div className="font-medium">{formatted}</div>;
    },
    enableSorting: true,
    enableHiding: true,
    meta: {
      label: "Price",
    },
  },
  {
    accessorKey: "availability",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Available In" />
    ),
    cell: ({ row }) => {
      const availability: ("In store" | "Online")[] =
        row.getValue("availability");
      return (
        <div className="flex space-x-2">
          {availability.map((location) => (
            <Badge key={location} variant="secondary">
              {location}
            </Badge>
          ))}
        </div>
      );
    },
    enableSorting: false,
    enableHiding: true,
    meta: {
      label: "Availability",
    },
  },
];

const _actions = ["export", "delete"] as const;

type Action = (typeof _actions)[number];

interface DataTable11ActionBarProps {
  table: TableType<z.infer<typeof schema>>;
}

export function DataTable11ActionBar({ table }: DataTable11ActionBarProps) {
  const rows = table.getFilteredSelectedRowModel().rows;
  const [isPending, startTransition] = React.useTransition();
  const [currentAction, setCurrentAction] = React.useState<Action | null>(null);

  const visible = rows.length > 0;

  const getIsActionPending = React.useCallback(
    (action: Action) => isPending && currentAction === action,
    [isPending, currentAction],
  );

  const onProductExport = React.useCallback(() => {
    setCurrentAction("export");
    startTransition(async () => {
      // Simulate export action - replace with actual export logic
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast.success("Products exported successfully");
      table.toggleAllRowsSelected(false);
    });
  }, [table]);

  const onProductDelete = React.useCallback(() => {
    setCurrentAction("delete");
    startTransition(async () => {
      // Simulate delete action - replace with actual delete logic
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Products deleted successfully");
      table.toggleAllRowsSelected(false);
    });
  }, [table]);

  return (
    <DataTableActionBar table={table} visible={visible} position="top">
      <DataTableActionBarSelection table={table} />
      <Separator
        orientation="vertical"
        className="hidden data-[orientation=vertical]:h-5 sm:block"
      />
      <div className="flex items-center gap-2">
        <DataTableActionBarAction
          size="icon"
          tooltip="Export products"
          isPending={getIsActionPending("export")}
          onClick={onProductExport}
        >
          <Download />
        </DataTableActionBarAction>

        <DataTableActionBarAction
          size="icon"
          tooltip="Delete products"
          isPending={getIsActionPending("delete")}
          onClick={onProductDelete}
        >
          <Trash2 />
        </DataTableActionBarAction>
      </div>
    </DataTableActionBar>
  );
}

export const DataTable11 = ({ className }: { className?: string }) => {
  const { table } = useDataTable({
    data: validatedData,
    columns,
    getRowId: (row) => row.id.toString(),
  });

  const hasSelectedRows = table.getFilteredSelectedRowModel().rows.length > 0;

  const Toolbar = (
    <DataTableToolbar table={table}>
      <Input
        placeholder="Search everything..."
        value={(table.getState().globalFilter as string) ?? ""}
        onChange={(event) => table.setGlobalFilter(event.target.value)}
        className="h-8 w-full lg:w-[250px]"
      />
    </DataTableToolbar>
  );

  return (
    <section className={cn("py-32", className)}>
      <div className="container">
        <div className="w-full">
          <div className="mb-8 text-left">
            <h2 className="text-2xl font-bold tracking-tight">
              Data Table With Row Selections and actionbar
            </h2>
            <p className="mt-2 text-muted-foreground">
              A feature-rich data table with sorting, global filtering, hideable
              columns,row selections and full pagination controls with
              responsive design.
            </p>
          </div>
          {Toolbar}
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DataTablePagination table={table} />
          {hasSelectedRows && <DataTable11ActionBar table={table} />}
        </div>
      </div>
    </section>
  );
};
