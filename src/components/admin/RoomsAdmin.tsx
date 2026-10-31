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

export function RoomsAdmin() {
  const qc = useQueryClient();
  const { data: rooms = [] } = useQuery(roomsQuery);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [n, setN] = useState(emptyRoom);
  const upd = async (id: string, patch: Database["public"]["Tables"]["rooms"]["Update"]) => {
    const { data, error } = await supabase.from("rooms").update(patch).eq("id", id).select("id");
    if (error) return void toast.error(errMsg(error));
    if (!data?.length) return void toast.error("Update was not saved.");
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };
  const startAdd = () => {
    setEditId(null);
    setN(emptyRoom);
    setOpen(true);
  };
  const startEdit = (r: (typeof rooms)[number]) => {
    setEditId(r.id);
    setN({
      room_number: r.room_number,
      name: r.name,
      room_type: r.room_type,
      capacity: String(r.capacity),
      hourly_rate: String(r.hourly_rate),
      description: r.description,
      amenities: r.amenities.join(", "),
      image_url: r.image_url ?? "",
    });
    setOpen(true);
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      room_number: n.room_number.trim(),
      name: n.name.trim(),
      room_type: n.room_type,
      capacity: Number(n.capacity),
      hourly_rate: Number(n.hourly_rate),
      description: n.description,
      amenities: n.amenities
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      image_url: n.image_url || null,
    };
    const { data, error } = editId
      ? await supabase.from("rooms").update(payload).eq("id", editId).select("id")
      : await supabase.from("rooms").insert(payload).select("id");
    if (error)
      return void toast.error(
        error.code === "23505" ? "That room number already exists." : errMsg(error),
      );
    if (!data?.length) return void toast.error("Room was not saved.");
    toast.success(editId ? "Room updated" : "Room added");
    setN(emptyRoom);
    setEditId(null);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };
  const del = async (r: (typeof rooms)[number]) => {
    if (!confirm(`Delete room ${r.room_number} · ${r.name}? This cannot be undone.`)) return;
    const { data, error } = await supabase.from("rooms").delete().eq("id", r.id).select("id");
    if (error)
      return void toast.error(
        error.code === "23503"
          ? "This room has booking history and can't be deleted. Switch Active off instead."
          : errMsg(error),
      );
    if (!data?.length) return void toast.error("Room was not deleted.");
    toast.success("Room deleted");
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };
  const term = q.trim().toLowerCase();
  const list = rooms.filter(
    (r) =>
      (!type || r.room_type === type) &&
      (!status ||
        (status === "active" && r.is_active && !r.maintenance_status) ||
        (status === "inactive" && !r.is_active) ||
        (status === "maintenance" && r.maintenance_status)) &&
      (!term || r.room_number.toLowerCase().includes(term) || r.name.toLowerCase().includes(term)),
  );
  const selectCls = "h-9 rounded-md border border-input bg-transparent px-3 text-sm";
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search rooms…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <select
          aria-label="Filter by type"
          className={selectCls}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="" className="bg-popover">
            All types
          </option>
          {ROOM_TYPES.map((t) => (
            <option key={t} value={t} className="bg-popover capitalize">
              {t === "vip" ? "VIP" : t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          className={selectCls}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="" className="bg-popover">
            All statuses
          </option>
          <option value="active" className="bg-popover">
            Available
          </option>
          <option value="inactive" className="bg-popover">
            Inactive
          </option>
          <option value="maintenance" className="bg-popover">
            Under maintenance
          </option>
        </select>
        <ViewToggle view={view} setView={setView} />
        <Button onClick={startAdd}>Add room</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit room" : "New room"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={add} className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  required
                  placeholder="Room number (e.g. 21)"
                  value={n.room_number}
                  onChange={(e) => setN({ ...n, room_number: e.target.value })}
                />
                <select
                  aria-label="Room type"
                  className={selectCls}
                  value={n.room_type}
                  onChange={(e) => setN({ ...n, room_type: e.target.value as RoomType })}
                >
                  {ROOM_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-popover">
                      {t === "vip" ? "VIP" : t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                required
                placeholder="Room name"
                value={n.name}
                onChange={(e) => setN({ ...n, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  required
                  type="number"
                  min={1}
                  placeholder="Capacity (guests)"
                  value={n.capacity}
                  onChange={(e) => setN({ ...n, capacity: e.target.value })}
                />
                <Input
                  required
                  type="number"
                  min={0}
                  placeholder="Rate per hour (₱)"
                  value={n.hourly_rate}
                  onChange={(e) => setN({ ...n, hourly_rate: e.target.value })}
                />
              </div>
              <Textarea
                placeholder="Description"
                value={n.description}
                onChange={(e) => setN({ ...n, description: e.target.value })}
              />
              <Input
                placeholder="Amenities, separated by commas"
                value={n.amenities}
                onChange={(e) => setN({ ...n, amenities: e.target.value })}
              />
              <ImagePicker
                value={n.image_url}
                fallback={ROOM_IMAGES[n.room_type]}
                onChange={(v) => setN({ ...n, image_url: v })}
              />
              <Button type="submit">{editId ? "Save changes" : "Save room"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.length === 0 && <p className="text-muted-foreground">No rooms match.</p>}
          {list.map((r) => (
            <div key={r.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <img
                src={r.image_url || ROOM_IMAGES[r.room_type]}
                alt={r.name}
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
              />
              <div className="space-y-2 p-4">
                <p className="font-medium">
                  {r.room_number} · {r.name}
                </p>
                <p className="text-xs capitalize text-muted-foreground">
                  {r.room_type} · {r.capacity} guests · {peso(r.hourly_rate)}/hr
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => upd(r.id, { is_active: v })}
                    />{" "}
                    Active
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={r.maintenance_status}
                      onCheckedChange={(v) => upd(r.id, { maintenance_status: v })}
                    />{" "}
                    Maintenance
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => startEdit(r)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => del(r)}
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
                <th className="p-3">Room</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Rate/hr</th>
                <th>Active</th>
                <th>Maintenance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-3 text-muted-foreground">
                    No rooms match.
                  </td>
                </tr>
              )}
              {list.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={r.image_url || ROOM_IMAGES[r.room_type]}
                        alt=""
                        className="h-10 w-14 rounded object-cover"
                        loading="lazy"
                      />
                      {r.room_number} · {r.name}
                    </div>
                  </td>
                  <td className="capitalize">{r.room_type}</td>
                  <td>{r.capacity}</td>
                  <td>
                    <Input
                      key={String(r.hourly_rate)}
                      type="number"
                      className="h-8 w-24"
                      defaultValue={r.hourly_rate}
                      onBlur={(e) =>
                        Number(e.target.value) !== Number(r.hourly_rate) &&
                        upd(r.id, { hourly_rate: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => upd(r.id, { is_active: v })}
                    />
                  </td>
                  <td>
                    <Switch
                      checked={r.maintenance_status}
                      onCheckedChange={(v) => upd(r.id, { maintenance_status: v })}
                    />
                  </td>
                  <td className="whitespace-nowrap pr-3">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => del(r)}
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
