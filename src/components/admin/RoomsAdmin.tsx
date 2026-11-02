import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { ImagePicker } from "@/components/ImagePicker";
import { supabase } from "@/integrations/supabase/client";

import type { Database } from "@/integrations/supabase/types";

import { ROOM_IMAGES, errMsg, peso } from "@/lib/afterglow";

import { roomsQuery, roomStatusReservationsQuery } from "@/lib/queries";

import { ViewToggle, ROOM_TYPES, emptyRoom, type RoomType } from "./shared";

// --------------------------------------------------
// TYPES AND CONSTANTS
// --------------------------------------------------

type OperationalStatus = "Active" | "Full" | "Occupied" | "Maintenance" | "Inactive";

type ScheduleStatus = "Available" | "Reserved" | "In Use";

type Reservation = {
  id: string;
  room_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
};

type Segment = {
  start: number;
  end: number;
  status: ScheduleStatus;
};

const OPENING_MINUTES = 14 * 60;
const CLOSING_MINUTES = 23 * 60;
const TOTAL_MINUTES = CLOSING_MINUTES - OPENING_MINUTES;

// --------------------------------------------------
// DATE AND TIME HELPERS
// --------------------------------------------------

function getTodayDate() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (remaining === 0) {
    return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }

  if (hours === 0) return `${remaining} min`;

  return `${hours} hr ${remaining} min`;
}

// --------------------------------------------------
// ROOM SCHEDULE CALCULATION
// --------------------------------------------------

function getRoomSchedule(roomId: string, reservations: Reservation[], date: string) {
  const roomReservations = reservations.filter(
    (reservation) => reservation.room_id === roomId && reservation.booking_date === date,
  );

  const intervals: {
    start: number;
    end: number;
    status: ScheduleStatus;
  }[] = [];

  roomReservations.forEach((reservation) => {
    let start = timeToMinutes(reservation.start_time);
    let end = timeToMinutes(reservation.end_time);

    if (reservation.status === "checked_in") {
      if (reservation.checked_out_at) {
        const checkout = new Date(reservation.checked_out_at);

        if (!Number.isNaN(checkout.getTime())) {
          end = checkout.getHours() * 60 + checkout.getMinutes();
        }
      } else {
        // Keep the room occupied until checkout is recorded.
        end = CLOSING_MINUTES;
      }
    }

    start = Math.max(start, OPENING_MINUTES);
    end = Math.min(end, CLOSING_MINUTES);

    if (end <= start) return;

    intervals.push({
      start,
      end,
      status: reservation.status === "checked_in" ? "In Use" : "Reserved",
    });
  });

  const boundaries = new Set<number>([OPENING_MINUTES, CLOSING_MINUTES]);

  intervals.forEach((interval) => {
    boundaries.add(interval.start);
    boundaries.add(interval.end);
  });

  const sorted = Array.from(boundaries).sort((a, b) => a - b);

  const segments: Segment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];

    const overlapping = intervals.filter(
      (interval) => interval.start < end && interval.end > start,
    );

    let status: ScheduleStatus = "Available";

    if (overlapping.some((item) => item.status === "In Use")) {
      status = "In Use";
    } else if (overlapping.length > 0) {
      status = "Reserved";
    }

    const previous = segments[segments.length - 1];

    if (previous && previous.status === status && previous.end === start) {
      previous.end = end;
    } else {
      segments.push({ start, end, status });
    }
  }

  const total = (status: ScheduleStatus) =>
    segments
      .filter((segment) => segment.status === status)
      .reduce((sum, segment) => sum + segment.end - segment.start, 0);

  return {
    segments,
    freeMinutes: total("Available"),
    reservedMinutes: total("Reserved"),
    inUseMinutes: total("In Use"),
  };
}

// --------------------------------------------------
// OPERATIONAL ROOM STATUS
// --------------------------------------------------

function getOperationalStatus(
  room: {
    id: string;
    is_active: boolean;
    maintenance_status: boolean;
  },
  reservations: Reservation[],
): OperationalStatus {
  // Priority 1: Inactive
  if (!room.is_active) return "Inactive";

  // Priority 2: Maintenance
  if (room.maintenance_status) return "Maintenance";

  // Priority 3: Occupied
  const occupied = reservations.some(
    (reservation) =>
      reservation.room_id === room.id &&
      reservation.status === "checked_in" &&
      !reservation.checked_out_at,
  );

  if (occupied) return "Occupied";

  // Priority 4: Full
  const schedule = getRoomSchedule(room.id, reservations, getTodayDate());

  if (schedule.freeMinutes === 0 && schedule.reservedMinutes > 0) {
    return "Full";
  }

  // Priority 5: Active
  return "Active";
}

// --------------------------------------------------
// STATUS BADGES
// --------------------------------------------------

function RoomStatusBadge({ status }: { status: OperationalStatus }) {
  const styles: Record<OperationalStatus, string> = {
    Active: "bg-green-500/10 text-green-600 border-green-500/20",
    Full: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    Occupied: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    Maintenance: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    Inactive: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function ScheduleBadge({ status }: { status: ScheduleStatus }) {
  const styles: Record<ScheduleStatus, string> = {
    Available: "bg-green-500/10 text-green-600",
    Reserved: "bg-yellow-500/10 text-yellow-600",
    "In Use": "bg-blue-500/10 text-blue-600",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

// --------------------------------------------------
// DAILY ROOM SCHEDULE
// --------------------------------------------------

function RoomDailySchedule({
  room,
  reservations,
}: {
  room: {
    id: string;
    is_active: boolean;
    maintenance_status: boolean;
  };
  reservations: Reservation[];
}) {
  const schedule = getRoomSchedule(room.id, reservations, getTodayDate());

  const unavailable = !room.is_active || room.maintenance_status;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Today's schedule</p>
          <p className="text-xs text-muted-foreground">Open 2:00 PM – 11:00 PM</p>
        </div>

        {!unavailable && (
          <div className="text-right">
            <p className="text-lg font-semibold text-green-600">
              {formatDuration(schedule.freeMinutes)}
            </p>
            <p className="text-xs text-muted-foreground">free today</p>
          </div>
        )}
      </div>

      {unavailable ? (
        <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
          {room.maintenance_status ? "This room is under maintenance." : "This room is inactive."}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {schedule.segments.map((segment, index) => (
              <div
                key={`${segment.start}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-xs text-muted-foreground">
                  {formatTime(segment.start)} – {formatTime(segment.end)}
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(segment.end - segment.start)}
                  </span>
                  <ScheduleBadge status={segment.status} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
            {schedule.segments.map((segment, index) => {
              const width = ((segment.end - segment.start) / TOTAL_MINUTES) * 100;

              const color =
                segment.status === "Available"
                  ? "bg-green-500"
                  : segment.status === "Reserved"
                    ? "bg-yellow-500"
                    : "bg-blue-500";

              return <div key={index} className={color} style={{ width: `${width}%` }} />;
            })}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>🟢 Available</span>
            <span>🟡 Reserved</span>
            <span>🔵 In Use</span>
          </div>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------
// MAIN COMPONENT
// --------------------------------------------------

export function RoomsAdmin() {
  const qc = useQueryClient();

  const { data: rooms = [], isLoading: roomsLoading } = useQuery(roomsQuery);

  const { data: statusReservations = [], isLoading: reservationsLoading } = useQuery(
    roomStatusReservationsQuery,
  );

  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");

  const [n, setN] = useState(emptyRoom);

  // ------------------------------------------------
  // UPDATE ROOM
  // ------------------------------------------------

  const upd = async (id: string, patch: Database["public"]["Tables"]["rooms"]["Update"]) => {
    const { data, error } = await supabase.from("rooms").update(patch).eq("id", id).select("id");

    if (error) {
      toast.error(errMsg(error));
      return;
    }

    if (!data?.length) {
      toast.error("Room update was not saved.");
      return;
    }

    toast.success("Room updated.");

    await qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  // ------------------------------------------------
  // ADD ROOM
  // ------------------------------------------------

  const startAdd = () => {
    setEditId(null);
    setN(emptyRoom);
    setOpen(true);
  };

  // ------------------------------------------------
  // EDIT ROOM
  // ------------------------------------------------

  const startEdit = (room: (typeof rooms)[number]) => {
    setEditId(room.id);

    setN({
      room_number: room.room_number,
      name: room.name,
      room_type: room.room_type,
      capacity: String(room.capacity),
      hourly_rate: String(room.hourly_rate),
      description: room.description,
      amenities: room.amenities.join(", "),
      image_url: room.image_url ?? "",
    });

    setOpen(true);
  };

  // ------------------------------------------------
  // SAVE ROOM
  // ------------------------------------------------

  const saveRoom = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const capacity = Number(n.capacity);
    const hourlyRate = Number(n.hourly_rate);

    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      !Number.isFinite(hourlyRate) ||
      hourlyRate < 0
    ) {
      toast.error("Enter a valid capacity and hourly rate.");
      return;
    }

    const payload = {
      room_number: n.room_number.trim(),
      name: n.name.trim(),
      room_type: n.room_type,
      capacity,
      hourly_rate: hourlyRate,
      description: n.description,
      amenities: n.amenities
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      image_url: n.image_url || null,
    };

    const result = editId
      ? await supabase.from("rooms").update(payload).eq("id", editId).select("id")
      : await supabase.from("rooms").insert(payload).select("id");

    if (result.error) {
      toast.error(
        result.error.code === "23505" ? "That room number already exists." : errMsg(result.error),
      );
      return;
    }

    if (!result.data?.length) {
      toast.error("Room was not saved.");
      return;
    }

    toast.success(editId ? "Room updated." : "Room added.");

    setOpen(false);
    setEditId(null);
    setN(emptyRoom);

    await qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  // ------------------------------------------------
  // DELETE ROOM
  // ------------------------------------------------

  const del = async (room: (typeof rooms)[number]) => {
    if (!confirm(`Delete room ${room.room_number} · ${room.name}? This cannot be undone.`)) {
      return;
    }

    const { data, error } = await supabase.from("rooms").delete().eq("id", room.id).select("id");

    if (error) {
      toast.error(
        error.code === "23503"
          ? "This room has booking history. Deactivate it instead."
          : errMsg(error),
      );
      return;
    }

    if (!data?.length) {
      toast.error("Room was not deleted.");
      return;
    }

    toast.success("Room deleted.");

    await qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  // ------------------------------------------------
  // SEARCH AND FILTER
  // ------------------------------------------------

  const term = q.trim().toLowerCase();

  const list = rooms.filter((room) => {
    const roomStatus = getOperationalStatus(room, statusReservations);

    const matchesType = !type || room.room_type === type;

    const matchesStatus = !status || roomStatus.toLowerCase() === status;

    const matchesSearch =
      !term ||
      room.room_number.toLowerCase().includes(term) ||
      room.name.toLowerCase().includes(term) ||
      (room.description ?? "").toLowerCase().includes(term) ||
      room.amenities.some((amenity) => amenity.toLowerCase().includes(term));

    return matchesType && matchesStatus && matchesSearch;
  });

  if (roomsLoading || reservationsLoading) {
    return <p className="mt-6 text-sm text-muted-foreground">Loading rooms and schedules...</p>;
  }

  const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

  return (
    <div className="mt-4 space-y-4">
      {/* SEARCH AND FILTERS */}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search rooms..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />

        <select
          aria-label="Filter by room type"
          className={selectClass}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All types</option>

          {ROOM_TYPES.map((roomType) => (
            <option key={roomType} value={roomType}>
              {roomType === "vip" ? "VIP" : roomType.charAt(0).toUpperCase() + roomType.slice(1)}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by room status"
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="full">Full</option>
          <option value="occupied">Occupied</option>
          <option value="maintenance">Maintenance</option>
          <option value="inactive">Inactive</option>
        </select>

        <ViewToggle view={view} setView={setView} />

        <Button onClick={startAdd}>Add room</Button>
      </div>

      {/* ADD / EDIT DIALOG */}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit room" : "New room"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={saveRoom} className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                required
                placeholder="Room number"
                value={n.room_number}
                onChange={(e) => setN({ ...n, room_number: e.target.value })}
              />

              <select
                aria-label="Room type"
                className={selectClass}
                value={n.room_type}
                onChange={(e) =>
                  setN({
                    ...n,
                    room_type: e.target.value as RoomType,
                  })
                }
              >
                {ROOM_TYPES.map((roomType) => (
                  <option key={roomType} value={roomType}>
                    {roomType === "vip"
                      ? "VIP"
                      : roomType.charAt(0).toUpperCase() + roomType.slice(1)}
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
                step={1}
                placeholder="Capacity"
                value={n.capacity}
                onChange={(e) => setN({ ...n, capacity: e.target.value })}
              />

              <Input
                required
                type="number"
                min={0}
                step="0.01"
                placeholder="Hourly rate"
                value={n.hourly_rate}
                onChange={(e) => setN({ ...n, hourly_rate: e.target.value })}
              />
            </div>

            <Textarea
              placeholder="Room description"
              value={n.description}
              onChange={(e) => setN({ ...n, description: e.target.value })}
            />

            <Input
              placeholder="Amenities separated by commas"
              value={n.amenities}
              onChange={(e) => setN({ ...n, amenities: e.target.value })}
            />

            <ImagePicker
              value={n.image_url}
              fallback={ROOM_IMAGES[n.room_type]}
              onChange={(value) => setN({ ...n, image_url: value })}
            />

            <Button type="submit">{editId ? "Save changes" : "Save room"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* GRID VIEW */}

      {view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.length === 0 && (
            <p className="text-sm text-muted-foreground">No rooms match your filters.</p>
          )}

          {list.map((room) => {
            const roomStatus = getOperationalStatus(room, statusReservations);

            return (
              <div
                key={room.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <img
                  src={room.image_url || ROOM_IMAGES[room.room_type]}
                  alt={room.name}
                  className="aspect-[16/10] w-full object-cover"
                  loading="lazy"
                />

                <div className="space-y-4 p-4">
                  <div>
                    <p className="font-semibold">{room.name}</p>
                    <p className="text-xs text-muted-foreground">Room {room.room_number}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {room.description || "No description provided."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{room.room_type}</span>
                    <span>·</span>
                    <span>{room.capacity} guests</span>
                    <span>·</span>
                    <span>{peso(room.hourly_rate)}/hr</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Room status</span>
                    <RoomStatusBadge status={roomStatus} />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium">Amenities</p>

                    <div className="flex flex-wrap gap-1.5">
                      {room.amenities.length > 0 ? (
                        room.amenities.map((amenity, index) => (
                          <span
                            key={`${room.id}-${index}`}
                            className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground"
                          >
                            {amenity}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No amenities listed</span>
                      )}
                    </div>
                  </div>

                  <RoomDailySchedule room={room} reservations={statusReservations} />

                  <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-xs">
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={room.is_active}
                        onCheckedChange={(value) => upd(room.id, { is_active: value })}
                      />
                      Active
                    </label>

                    <label className="flex items-center gap-2">
                      <Switch
                        checked={room.maintenance_status}
                        onCheckedChange={(value) => upd(room.id, { maintenance_status: value })}
                      />
                      Maintenance
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(room)}>
                      Edit
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => del(room)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */

        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Room</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>Rate/hr</th>
                  <th>Room status</th>
                  <th>Active</th>
                  <th>Maintenance</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-muted-foreground">
                      No rooms match your filters.
                    </td>
                  </tr>
                )}

                {list.map((room) => {
                  const roomStatus = getOperationalStatus(room, statusReservations);

                  return (
                    <tr key={room.id} className="border-t border-border">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={room.image_url || ROOM_IMAGES[room.room_type]}
                            alt=""
                            className="h-10 w-14 rounded object-cover"
                            loading="lazy"
                          />

                          <div className="min-w-0">
                            <p className="font-medium">{room.name}</p>
                            <p className="text-xs text-muted-foreground">Room {room.room_number}</p>
                            <p className="max-w-xs truncate text-xs text-muted-foreground">
                              {room.description}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="capitalize">{room.room_type}</td>
                      <td>{room.capacity}</td>

                      <td>
                        <Input
                          key={`${room.id}-${room.hourly_rate}`}
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-8 w-24"
                          defaultValue={room.hourly_rate}
                          onBlur={(e) => {
                            const value = Number(e.target.value);

                            if (
                              Number.isFinite(value) &&
                              value >= 0 &&
                              value !== Number(room.hourly_rate)
                            ) {
                              upd(room.id, { hourly_rate: value });
                            }
                          }}
                        />
                      </td>

                      <td>
                        <RoomStatusBadge status={roomStatus} />
                      </td>

                      <td>
                        <Switch
                          checked={room.is_active}
                          onCheckedChange={(value) => upd(room.id, { is_active: value })}
                        />
                      </td>

                      <td>
                        <Switch
                          checked={room.maintenance_status}
                          onCheckedChange={(value) => upd(room.id, { maintenance_status: value })}
                        />
                      </td>

                      <td className="whitespace-nowrap pr-3">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(room)}>
                          Edit
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => del(room)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ROOM SCHEDULES */}

          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((room) => (
              <div
                key={`schedule-${room.id}`}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="mb-3">
                  <p className="font-semibold">{room.name}</p>
                  <p className="text-xs text-muted-foreground">Room {room.room_number}</p>
                </div>

                <RoomDailySchedule room={room} reservations={statusReservations} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
