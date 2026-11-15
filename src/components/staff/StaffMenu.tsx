import { useEffect, useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Pagination } from "@/components/Pagination";

import { foodImage, peso } from "@/lib/afterglow";
import { menuQuery } from "@/lib/queries";

import { ViewToggle } from "@/components/admin/shared";

type StatusFilter = "all" | "available" | "unavailable";

export function StaffMenu() {
  const { data } = useQuery(menuQuery);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const activeFilterCount = (cat ? 1 : 0) + (status !== "all" ? 1 : 0);

  type Item = NonNullable<typeof data>["items"][number];

  const catName = (id: string) => data?.categories.find((c) => c.id === id)?.name;

  const term = q.trim().toLowerCase();

  const items = useMemo(
    () =>
      (data?.items ?? []).filter((i) => {
        const matchesCategory = !cat || i.category_id === cat;

        const matchesSearch =
          !term ||
          i.name.toLowerCase().includes(term) ||
          (i.description ?? "").toLowerCase().includes(term);

        const matchesStatus =
          status === "all" ||
          (status === "available" && i.is_available) ||
          (status === "unavailable" && !i.is_available);

        return matchesCategory && matchesSearch && matchesStatus;
      }),
    [data?.items, cat, term, status],
  );

  useEffect(() => {
    setPage(1);
  }, [q, cat, status]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const clearFilters = () => {
    setCat("");
    setStatus("all");
  };

  const availabilityBadge = (available: boolean) => (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        available ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
      }`}
    >
      {available ? "Available" : "Unavailable"}
    </span>
  );

  return (
    <div className="mt-4 space-y-4">
      {/* PAGE HEADING */}
      <div>
        <h2 className="font-display text-xl font-bold">Food &amp; Beverages</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          View the available food and beverages, prices, and item availability.
        </p>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {/* SEARCH */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              placeholder="Search food and beverages..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* FILTER */}
          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter className="mr-2 h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* VIEW TOGGLE */}
        <ViewToggle view={view} setView={setView} />
      </div>

      {/* GRID VIEW */}
      {view === "grid" && (
        <>
          {items.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No items match your filters.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedItems.map((i) => (
                <div key={i.id} className="overflow-hidden rounded-xl border border-border bg-card">
                  <img
                    src={i.image_url || foodImage(i.image_key)}
                    alt={i.name}
                    className="aspect-[16/10] w-full object-cover"
                    loading="lazy"
                  />

                  <div className="space-y-3 p-4">
                    <div>
                      <p className="font-medium">{i.name}</p>

                      {i.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {i.description}
                        </p>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {catName(i.category_id)} · {peso(i.price)}
                    </p>

                    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">Availability</span>

                      {availabilityBadge(i.is_available)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* LIST VIEW */}
      {view === "list" && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground">
              <tr>
                <th className="p-3">Item</th>
                <th className="p-3">Category</th>
                <th className="p-3">Price</th>
                <th className="p-3">Availability</th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-muted-foreground">
                    No items match your filters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((i: Item) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={i.image_url || foodImage(i.image_key)}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                          loading="lazy"
                        />

                        <div className="min-w-0">
                          <p className="font-medium">{i.name}</p>

                          {i.description && (
                            <p className="mt-1 line-clamp-2 max-w-xs text-xs text-muted-foreground">
                              {i.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-3">{catName(i.category_id)}</td>

                    <td className="p-3 font-medium">{peso(i.price)}</td>

                    <td className="p-3">{availabilityBadge(i.is_available)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PAGINATION */}
      <Pagination
        page={currentPage}
        pageSize={pageSize}
        totalItems={items.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        itemLabel="items"
      />

      {/* FILTER DIALOG */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Menu filters</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* CATEGORY FILTER */}
            <div>
              <Label htmlFor="staff-menu-category-filter">Category</Label>

              <Select
                value={cat || "all"}
                onValueChange={(value) => setCat(value === "all" ? "" : value)}
              >
                <SelectTrigger
                  id="staff-menu-category-filter"
                  className="mt-1 h-10 w-full justify-between text-sm"
                >
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className="cursor-pointer">
                    All categories
                  </SelectItem>

                  {data?.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="cursor-pointer">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* STATUS FILTER */}
            <div>
              <Label htmlFor="staff-menu-status-filter">Availability</Label>

              <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
                <SelectTrigger
                  id="staff-menu-status-filter"
                  className="mt-1 h-10 w-full justify-between text-sm"
                >
                  <SelectValue placeholder="Select availability" />
                </SelectTrigger>

                <SelectContent position="popper" className="max-h-60">
                  <SelectItem value="all" className="cursor-pointer">
                    All
                  </SelectItem>

                  <SelectItem value="available" className="cursor-pointer">
                    Available
                  </SelectItem>

                  <SelectItem value="unavailable" className="cursor-pointer">
                    Unavailable
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* FILTER ACTIONS */}
            <div className="flex justify-between gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={clearFilters}>
                Clear all
              </Button>

              <Button onClick={() => setFilterOpen(false)}>Apply filters</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
