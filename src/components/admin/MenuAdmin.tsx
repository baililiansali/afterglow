import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/SiteChrome";
import { StatusBadge, PaymentMethodBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ROOM_IMAGES, errMsg, fmtDate, fmtTime, foodImage, peso } from "@/lib/afterglow";
import { ImagePicker } from "@/components/ImagePicker";
import { useAuth } from "@/lib/auth";
import { menuQuery, roomsQuery, settingsQuery } from "@/lib/queries";
import type { Database } from "@/integrations/supabase/types";
import {
  useProfiles,
  ViewToggle,
  NEXT,
  ROOM_TYPES,
  emptyRoom,
  type ResRow,
  type OrderRow,
  type ResStatus,
  type FoStatus,
  type RoomType,
} from "./shared";

export function MenuAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery(menuQuery);
  const emptyItem = { name: "", price: "", category_id: "", description: "", image_url: "" };

  const [n, setN] = useState(emptyItem);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");

  const upd = async (id: string, patch: Database["public"]["Tables"]["menu_items"]["Update"]) => {
    const { data, error } = await supabase
      .from("menu_items")
      .update(patch)
      .eq("id", id)
      .select("id");

    if (error) return void toast.error(errMsg(error));
    if (!data?.length) return void toast.error("Update was not saved.");

    qc.invalidateQueries({ queryKey: ["menu"] });
  };

  type Item = NonNullable<typeof data>["items"][number];

  const startAdd = () => {
    setEditId(null);
    setN(emptyItem);
    setOpen(true);
  };

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

  const add = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: n.name.trim(),
      price: Number(n.price),
      category_id: n.category_id,
      description: n.description || null,
      image_url: n.image_url || null,
    };

    const { data: rows, error } = editId
      ? await supabase.from("menu_items").update(payload).eq("id", editId).select("id")
      : await supabase.from("menu_items").insert(payload).select("id");

    if (error) return void toast.error(errMsg(error));
    if (!rows?.length) return void toast.error("Item was not saved.");

    toast.success(editId ? "Item updated" : "Item added");

    setN(emptyItem);
    setEditId(null);
    setOpen(false);

    qc.invalidateQueries({ queryKey: ["menu"] });
  };

  const del = async (i: Item) => {
    if (!confirm(`Delete "${i.name}"? This cannot be undone.`)) return;

    const { data: rows, error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", i.id)
      .select("id");

    if (error)
      return void toast.error(
        error.code === "23503"
          ? "This item appears in past orders and can't be deleted. Switch Available off instead."
          : errMsg(error),
      );

    if (!rows?.length) return void toast.error("Item was not deleted.");

    toast.success("Item deleted");
    qc.invalidateQueries({ queryKey: ["menu"] });
  };

  const catName = (id: string) => data?.categories.find((c) => c.id === id)?.name;
  const term = q.trim().toLowerCase();

  const items = (data?.items ?? []).filter(
    (i) =>
      (!cat || i.category_id === cat) &&
      (!term ||
        i.name.toLowerCase().includes(term) ||
        (i.description ?? "").toLowerCase().includes(term)),
  );

  const selectCls = "h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search menu…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />

        <select
          aria-label="Filter by category"
          className={selectCls}
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          <option value="" className="bg-popover">
            All categories
          </option>

          {data?.categories.map((c) => (
            <option key={c.id} value={c.id} className="bg-popover">
              {c.name}
            </option>
          ))}
        </select>

        <ViewToggle view={view} setView={setView} />

        <Button onClick={startAdd}>Add item</Button>

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
                placeholder="Price"
                value={n.price}
                onChange={(e) => setN({ ...n, price: e.target.value })}
              />

              <select
                required
                className={selectCls}
                value={n.category_id}
                onChange={(e) => setN({ ...n, category_id: e.target.value })}
              >
                <option value="" className="bg-popover">
                  Category…
                </option>

                {data?.categories.map((c) => (
                  <option key={c.id} value={c.id} className="bg-popover">
                    {c.name}
                  </option>
                ))}
              </select>

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

      {view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.length === 0 && <p className="text-muted-foreground">No items match.</p>}

          {items.map((i) => (
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
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
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

                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => startEdit(i)}>
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => del(i)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground">
              <tr>
                <th className="p-3">Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Availability</th>
                <th>Featured</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-3 text-muted-foreground">
                    No items match.
                  </td>
                </tr>
              )}

              {items.map((i) => (
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
                          <p className="mt-1 max-w-xs text-xs text-muted-foreground line-clamp-2">
                            {i.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>{catName(i.category_id)}</td>

                  <td>
                    <Input
                      key={String(i.price)}
                      type="number"
                      className="h-8 w-24"
                      defaultValue={i.price}
                      onBlur={(e) =>
                        Number(e.target.value) !== Number(i.price) &&
                        upd(i.id, { price: Number(e.target.value) })
                      }
                    />
                  </td>

                  <td>
                    <Switch
                      checked={i.is_available}
                      onCheckedChange={(v) => upd(i.id, { is_available: v })}
                    />
                  </td>

                  <td>
                    <Switch
                      checked={i.is_featured}
                      onCheckedChange={(v) => upd(i.id, { is_featured: v })}
                    />
                  </td>

                  <td className="whitespace-nowrap pr-3">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(i)}>
                      Edit
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => del(i)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
