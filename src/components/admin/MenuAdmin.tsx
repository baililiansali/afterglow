import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Filter, Search, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { ImagePicker } from "@/components/ImagePicker";
import { Pagination } from "@/components/Pagination";

import { supabase } from "@/integrations/supabase/client";
import { errMsg, foodImage, peso } from "@/lib/afterglow";
import { menuQuery } from "@/lib/queries";

import type { Database } from "@/integrations/supabase/types";

import { ViewToggle } from "./shared";

type StatusFilter = "all" | "available" | "unavailable" | "featured";

export function MenuAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery(menuQuery);

  const emptyItem = {
    name: "",
    price: "",
    category_id: "",
    description: "",
    image_url: "",
  };

  const [n, setN] = useState(emptyItem);
  const [open, setOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [view, setView] = useState<"list" | "grid">("list");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const activeFilterCount = (cat ? 1 : 0) + (status !== "all" ? 1 : 0);

  type Item = NonNullable<typeof data>["items"][number];

  // --------------------------------------------------
  // UPDATE MENU ITEM
  // --------------------------------------------------

  const upd = async (id: string, patch: Database["public"]["Tables"]["menu_items"]["Update"]) => {
    const { data: rows, error } = await supabase
      .from("menu_items")
      .update(patch)
      .eq("id", id)
      .select("id");

    if (error) {
      toast.error(errMsg(error));
      return;
    }

    if (!rows?.length) {
      toast.error("Update was not saved.");
      return;
    }

    toast.success("Item updated.");

    await qc.invalidateQueries({ queryKey: ["menu"] });
  };

  // --------------------------------------------------
  // ADD MENU ITEM
  // --------------------------------------------------

  const startAdd = () => {
    setEditId(null);
    setN(emptyItem);
    setOpen(true);
  };

  // --------------------------------------------------
  // EDIT MENU ITEM
  // --------------------------------------------------

  const startEdit = (i: Item) => {
    setEditId(i.id);

    setN({
      name: i.name,
      price: String(i.price),
      category_id: i.category_id,
      description: i.description ?? "",
      image_url: i.image_url ?? "",
    });

    setOpen(true);
  };

  // --------------------------------------------------
  // SAVE MENU ITEM
  // --------------------------------------------------

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const price = Number(n.price);

    if (!Number.isFinite(price) || price < 0) {
      toast.error("Please enter a valid price.");
      return;
    }

    if (!n.category_id) {
      toast.error("Please select a category.");
      return;
    }

    const payload = {
      name: n.name.trim(),
      price,
      category_id: n.category_id,
      description: n.description.trim() || null,
      image_url: n.image_url || null,
    };

    const { data: rows, error } = editId
      ? await supabase.from("menu_items").update(payload).eq("id", editId).select("id")
      : await supabase.from("menu_items").insert(payload).select("id");

    if (error) {
      toast.error(errMsg(error));
      return;
    }

    if (!rows?.length) {
      toast.error("Item was not saved.");
      return;
    }

    toast.success(editId ? "Item updated." : "Item added.");

    setN(emptyItem);
    setEditId(null);
    setOpen(false);

    await qc.invalidateQueries({ queryKey: ["menu"] });
  };

  // --------------------------------------------------
  // DELETE MENU ITEM
  // --------------------------------------------------

  const del = async (i: Item) => {
    if (!confirm(`Delete "${i.name}"? This cannot be undone.`)) return;

    const { data: rows, error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", i.id)
      .select("id");

    if (error) {
      toast.error(
        error.code === "23503"
          ? "This item appears in past orders and can't be deleted. Switch Available off instead."
          : errMsg(error),
      );
      return;
    }

    if (!rows?.length) {
      toast.error("Item was not deleted.");
      return;
    }

    toast.success("Item deleted.");

    await qc.invalidateQueries({ queryKey: ["menu"] });
  };

  // --------------------------------------------------
  // SEARCH AND FILTER
  // --------------------------------------------------

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
          (status === "unavailable" && !i.is_available) ||
          (status === "featured" && i.is_featured);

        return matchesCategory && matchesSearch && matchesStatus;
      }),
    [data?.items, cat, term, status],
  );

  useEffect(() => {
    setPage(1);
  }, [q, cat, status]);

  // --------------------------------------------------
  // PAGINATION
  // --------------------------------------------------

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

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <div className="mt-4 space-y-4">
      {/* PAGE HEADING */}
      <div>
        <h2 className="font-display text-xl font-bold">Food &amp; Beverages</h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Manage your food and beverage menu, prices, availability, and featured items.
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

        {/* VIEW TOGGLE AND ADD ITEM */}
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle view={view} setView={setView} />
          <Button onClick={startAdd}>Add item</Button>
        </div>
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

                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <label className="flex items-center gap-2">
                        <Switch
                          checked={i.is_available}
                          onCheckedChange={(v) => upd(i.id, { is_available: v })}
                        />
                        Availability
                      </label>

                      <label className="flex items-center gap-2">
                        <Switch
                          checked={i.is_featured}
                          onCheckedChange={(v) => upd(i.id, { is_featured: v })}
                        />
                        Featured
                      </label>
                    </div>

                    {/* GRID ACTIONS */}
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(i)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => del(i)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
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
                <th className="p-3">Featured</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                    No items match your filters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((i) => (
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

                    <td className="p-3">
                      <Input
                        key={`${i.id}-${i.price}`}
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-8 w-24"
                        defaultValue={i.price}
                        onBlur={(e) => {
                          const value = Number(e.target.value);

                          if (Number.isFinite(value) && value >= 0 && value !== Number(i.price)) {
                            void upd(i.id, { price: value });
                          }
                        }}
                      />
                    </td>

                    <td className="p-3">
                      <Switch
                        checked={i.is_available}
                        onCheckedChange={(v) => upd(i.id, { is_available: v })}
                      />
                    </td>

                    <td className="p-3">
                      <Switch
                        checked={i.is_featured}
                        onCheckedChange={(v) => upd(i.id, { is_featured: v })}
                      />
                    </td>

                    {/* LIST ACTIONS */}
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(i)}
                          aria-label={`Edit ${i.name}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => del(i)}
                          aria-label={`Delete ${i.name}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
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
              <Label htmlFor="menu-category-filter">Category</Label>

              <Select
                value={cat || "all"}
                onValueChange={(value) => setCat(value === "all" ? "" : value)}
              >
                <SelectTrigger
                  id="menu-category-filter"
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
              <Label htmlFor="menu-status-filter">Status</Label>

              <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
                <SelectTrigger
                  id="menu-status-filter"
                  className="mt-1 h-10 w-full justify-between text-sm"
                >
                  <SelectValue placeholder="Select status" />
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

                  <SelectItem value="featured" className="cursor-pointer">
                    Featured
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

      {/* ADD / EDIT ITEM DIALOG */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit menu item" : "New menu item"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={add} className="grid gap-3">
            <Input
              required
              placeholder="Item name"
              value={n.name}
              onChange={(e) => setN({ ...n, name: e.target.value })}
            />

            <Input
              required
              type="number"
              min={0}
              step="0.01"
              placeholder="Price"
              value={n.price}
              onChange={(e) => setN({ ...n, price: e.target.value })}
            />

            <Select
              value={n.category_id}
              onValueChange={(value) => setN({ ...n, category_id: value })}
            >
              <SelectTrigger aria-label="Category" className="h-10 w-full justify-between text-sm">
                <SelectValue placeholder="Category..." />
              </SelectTrigger>

              <SelectContent position="popper" className="max-h-60">
                {data?.categories.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="cursor-pointer">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Textarea
              placeholder="Description"
              value={n.description}
              onChange={(e) => setN({ ...n, description: e.target.value })}
            />

            <ImagePicker value={n.image_url} onChange={(v) => setN({ ...n, image_url: v })} />

            <Button type="submit">{editId ? "Save changes" : "Save item"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
