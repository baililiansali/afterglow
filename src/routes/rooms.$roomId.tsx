import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Minus, Plus, Users, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRedirectAdmin } from "@/components/SiteChrome";
import { supabase } from "@/integrations/supabase/client";
import { ROOM_IMAGES, errMsg, fmtDate, fmtTime, foodImage, overlaps, peso } from "@/lib/afterglow";
import {
  addHours,
  busySlotsQuery,
  hourOptions,
  menuQuery,
  roomQuery,
  settingsQuery,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { cartPayload, useCart } from "@/lib/cart";
import { ROOM_TYPE_LABELS } from "@/types/afterglow";

export const Route = createFileRoute("/rooms/$roomId")({
  head: () => ({
    meta: [
      { title: "Room details — SONARA" },
      {
        name: "description",
        content: "See room details, check availability and book your karaoke session.",
      },
      { property: "og:title", content: "Room details — SONARA" },
      {
        property: "og:description",
        content: "Check availability and book your karaoke session.",
      },
    ],
  }),
  component: RoomPage,
});

const BUSINESS_TIME_ZONE = "Asia/Manila";
const MAX_PROOF_SIZE = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];

type PaymentMethod = "cash" | "gcash";
type ProofFile = File | null;

function createUploadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getManilaDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

const today = () => getManilaDateTime().date;

function isPastStart(date: string, start: string) {
  const now = getManilaDateTime();

  if (date < now.date) return true;
  if (date > now.date) return false;

  return `${start}:00` <= now.time;
}

function isSlotTaken(
  slots: { start_time: string; end_time: string }[],
  start: string,
  hours: number,
) {
  const end = addHours(start, hours);

  return slots.some((slot) => overlaps(`${start}:00`, `${end}:00`, slot.start_time, slot.end_time));
}

function isOverlapDatabaseError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const dbError = error as {
    code?: string;
    message?: string;
  };

  return (
    dbError.code === "23P01" ||
    dbError.message?.toLowerCase().includes("reservations_no_overlapping_active_room_bookings") ===
      true
  );
}

function validateProofFile(file: File | null): string | null {
  if (!file) {
    return "Please upload your GCash payment screenshot.";
  }

  if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
    return "Only JPG, PNG, and WEBP images are accepted.";
  }

  if (file.size > MAX_PROOF_SIZE) {
    return "Your screenshot must not exceed 5 MB.";
  }

  return null;
}

function PaymentMethodSelector({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
}) {
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-2">
      {(["cash", "gcash"] as const).map((method) => (
        <button
          key={method}
          type="button"
          onClick={() => onChange(method)}
          className={`rounded-md border px-3 py-2 text-sm transition ${
            value === method
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:border-primary/60"
          }`}
        >
          {method === "cash" ? "Cash" : "GCash"}
        </button>
      ))}
    </div>
  );
}

function GCashDetails({
  settings,
  payerName,
  setPayerName,
  payerAccount,
  setPayerAccount,
  payRef,
  setPayRef,
  proof,
  setProof,
  prefix,
}: {
  settings:
    | {
        ewallet_provider?: string | null;
        ewallet_account_name?: string | null;
        ewallet_account_number?: string | null;
        ewallet_instructions?: string | null;
      }
    | null
    | undefined;
  payerName: string;
  setPayerName: (value: string) => void;
  payerAccount: string;
  setPayerAccount: (value: string) => void;
  payRef: string;
  setPayRef: (value: string) => void;
  proof: ProofFile;
  setProof: (value: ProofFile) => void;
  prefix: string;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
        <p className="mb-2 font-medium">
          Send payment to this {settings?.ewallet_provider ?? "GCash"} account
        </p>

        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Account name</span>
          <span className="text-right font-medium">
            {settings?.ewallet_account_name || "Not configured"}
          </span>
        </div>

        <div className="mt-1 flex justify-between gap-3">
          <span className="text-muted-foreground">Account number</span>
          <span className="text-right font-medium">
            {settings?.ewallet_account_number || "Not configured"}
          </span>
        </div>

        {settings?.ewallet_instructions && (
          <p className="mt-2 text-xs text-muted-foreground">{settings.ewallet_instructions}</p>
        )}
      </div>

      <p className="text-sm font-medium">Your GCash payment details</p>

      <div>
        <Label htmlFor={`${prefix}-payer-name`}>Account name</Label>
        <Input
          id={`${prefix}-payer-name`}
          maxLength={100}
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          placeholder="Juan Dela Cruz"
        />
      </div>

      <div>
        <Label htmlFor={`${prefix}-payer-account`}>Account number</Label>
        <Input
          id={`${prefix}-payer-account`}
          inputMode="tel"
          maxLength={20}
          value={payerAccount}
          onChange={(e) => setPayerAccount(e.target.value)}
          placeholder="0917 123 4567"
        />
      </div>

      <div>
        <Label htmlFor={`${prefix}-reference`}>GCash transaction reference</Label>
        <Input
          id={`${prefix}-reference`}
          maxLength={100}
          value={payRef}
          onChange={(e) => setPayRef(e.target.value)}
          placeholder="Enter transaction reference"
        />
      </div>

      <div>
        <Label htmlFor={`${prefix}-proof`}>Payment screenshot</Label>

        <label
          htmlFor={`${prefix}-proof`}
          className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/20 p-4 text-center transition hover:border-primary"
        >
          {proof ? (
            <>
              <ImageIcon className="mb-2 h-7 w-7 text-primary" />

              <span className="max-w-full break-all text-sm font-medium">{proof.name}</span>

              <span className="mt-1 text-xs text-muted-foreground">
                {(proof.size / 1024 / 1024).toFixed(2)} MB · Click to change
              </span>
            </>
          ) : (
            <>
              <Upload className="mb-2 h-7 w-7 text-muted-foreground" />

              <span className="text-sm font-medium">Choose payment screenshot</span>

              <span className="mt-1 text-xs text-muted-foreground">
                JPG, PNG, or WEBP · Maximum 5 MB
              </span>
            </>
          )}
        </label>

        <input
          id={`${prefix}-proof`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;

            if (!file) {
              setProof(null);
              return;
            }

            const error = validateProofFile(file);

            if (error) {
              toast.error(error);
              e.target.value = "";
              setProof(null);
              return;
            }

            setProof(file);
          }}
        />
      </div>
    </div>
  );
}

function RoomPage() {
  useRedirectAdmin();

  const { roomId } = Route.useParams();
  const { data: room, isLoading } = useQuery(roomQuery(roomId));
  const { data: settings } = useQuery(settingsQuery);
  const { user } = useAuth();
  const cart = useCart();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [date, setDate] = useState(today());
  const [start, setStart] = useState("");
  const [hours, setHours] = useState(2);
  const [guests, setGuests] = useState(2);
  const [requests, setRequests] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Independent room payment details
  const [roomPayment, setRoomPayment] = useState<PaymentMethod>("cash");
  const [roomPayerName, setRoomPayerName] = useState("");
  const [roomPayerAccount, setRoomPayerAccount] = useState("");
  const [roomPayRef, setRoomPayRef] = useState("");
  const [roomProof, setRoomProof] = useState<ProofFile>(null);

  // Independent food payment details
  const [foodPayment, setFoodPayment] = useState<PaymentMethod>("cash");
  const [foodPayerName, setFoodPayerName] = useState("");
  const [foodPayerAccount, setFoodPayerAccount] = useState("");
  const [foodPayRef, setFoodPayRef] = useState("");
  const [foodProof, setFoodProof] = useState<ProofFile>(null);

  const [receipt, setReceipt] = useState<null | {
    ref: string;
    date: string;
    start: string;
    hours: number;
    guests: number;
    roomPayment: PaymentMethod;
    foodPayment: PaymentMethod | null;
    roomProofMessage: string | null;
    foodProofMessage: string | null;
    roomTotal: number;
    foodTotal: number;
    items: {
      name: string;
      qty: number;
      total: number;
    }[];
  }>(null);

  const { data: menu } = useQuery(menuQuery);
  const [saving, setSaving] = useState(false);
  const { data: busy = [] } = useQuery(busySlotsQuery(roomId, date));

  const starts = useMemo(
    () => (settings ? hourOptions(settings.opening_time, settings.closing_time) : []),
    [settings],
  );

  const closeH = settings ? Number(settings.closing_time.slice(0, 2)) : 23;

  const maxH = settings?.max_duration_hours ?? 6;
  const minH = settings?.min_duration_hours ?? 1;

  const isTaken = (s: string, h: number) => isSlotTaken(busy, s, h);

  if (isLoading) {
    return <p className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Loading…</p>;
  }

  if (!room) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20">
        <p>Room not found.</p>
        <Link to="/rooms" className="text-primary">
          Back to rooms
        </Link>
      </div>
    );
  }

  const bookable = room.is_active && !room.maintenance_status;

  const validDurations = start
    ? Array.from({ length: Math.max(0, maxH - minH + 1) }, (_, i) => minH + i).filter(
        (h) => Number(start.slice(0, 2)) + h <= closeH,
      )
    : [];

  const roomTotal = room.hourly_rate * hours;
  const foodTotal = cart.subtotal;
  const hasFood = cart.items.length > 0;

  const activeCategoryIds = new Set(
    (menu?.categories ?? [])
      .filter((category) => category.is_active)
      .map((category) => category.id),
  );

  const menuItems = (menu?.items ?? []).filter(
    (item) => item.is_active && item.is_available && activeCategoryIds.has(item.category_id),
  );

  const qtyOf = (id: string) => cart.items.find((item) => item.id === id)?.quantity ?? 0;

  const getFreshBusySlots = async () => {
    await qc.invalidateQueries({
      queryKey: ["busy", roomId, date],
      exact: true,
    });

    return qc.fetchQuery({
      ...busySlotsQuery(roomId, date),
      staleTime: 0,
    });
  };

  const validateSelection = (
    slots: {
      start_time: string;
      end_time: string;
    }[],
  ): string | null => {
    if (!date) {
      return "Please select a booking date.";
    }

    if (date < today()) {
      return "You cannot book a date that has already passed.";
    }

    if (!start) {
      return "Please select a start time.";
    }

    if (isPastStart(date, start)) {
      return "The selected start time has already passed. Please choose another time.";
    }

    if (!room.is_active || room.maintenance_status) {
      return "This room is currently unavailable for booking.";
    }

    if (guests < 1 || guests > room.capacity) {
      return `Guest count must be between 1 and ${room.capacity}.`;
    }

    if (hours < minH || hours > maxH) {
      return "The selected reservation duration is not allowed.";
    }

    if (Number(start.slice(0, 2)) + hours > closeH) {
      return "Your reservation must end before the business closing time.";
    }

    if (isSlotTaken(slots, start, hours)) {
      return "This time slot is no longer available. Please choose another time.";
    }

    return null;
  };

  const validateGCash = (
    method: PaymentMethod,
    name: string,
    account: string,
    reference: string,
    proof: ProofFile,
    label: string,
  ): string | null => {
    if (method !== "gcash") return null;

    if (name.trim().length < 2) {
      return `Enter the ${label} GCash account name.`;
    }

    if (!/^[0-9+ -]{7,20}$/.test(account.trim())) {
      return `Enter a valid ${label} GCash account number.`;
    }

    if (reference.trim().length < 4) {
      return `Enter the ${label} GCash transaction reference.`;
    }

    return validateProofFile(proof);
  };

  const toMeals = async () => {
    if (!user) {
      return void navigate({ to: "/login" });
    }

    if (!start) {
      toast.error("Pick a start time.");
      return;
    }

    try {
      const freshBusy = await getFreshBusySlots();
      const validationError = validateSelection(freshBusy);

      if (validationError) {
        toast.error(validationError);
        return;
      }

      setStep(2);
    } catch {
      toast.error("Unable to check room availability. Please try again.");
    }
  };

  const uploadPaymentProof = async ({
    targetType,
    targetId,
    file,
    reference,
    payerName,
    payerAccount,
  }: {
    targetType: "reservation" | "food_order";
    targetId: string;
    file: File;
    reference: string;
    payerName: string;
    payerAccount: string;
  }): Promise<string | null> => {
    const extension =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";

    const path = `${user!.id}/${targetType}/${targetId}/${createUploadId()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return `Screenshot upload failed: ${uploadError.message}`;
    }

    const { error: proofError } = await supabase.rpc("submit_payment_proof", {
      _target_type: targetType,
      _target_id: targetId,
      _storage_path: path,
      _payment_reference: reference.trim(),
      _payer_name: payerName.trim(),
      _payer_account_number: payerAccount.trim(),
    });

    if (proofError) {
      await supabase.storage.from("payment-proofs").remove([path]);

      return `Payment proof registration failed: ${proofError.message}`;
    }

    return null;
  };

  const submit = async () => {
    if (!user) {
      return void navigate({ to: "/login" });
    }

    const roomPaymentError = validateGCash(
      roomPayment,
      roomPayerName,
      roomPayerAccount,
      roomPayRef,
      roomProof,
      "room payment",
    );

    if (roomPaymentError) {
      toast.error(roomPaymentError);
      return;
    }

    if (hasFood) {
      const foodPaymentError = validateGCash(
        foodPayment,
        foodPayerName,
        foodPayerAccount,
        foodPayRef,
        foodProof,
        "food payment",
      );

      if (foodPaymentError) {
        toast.error(foodPaymentError);
        return;
      }
    }

    if (roomPayment === "gcash" && !settings?.ewallet_account_number) {
      toast.error("The business GCash account has not been configured yet.");
      return;
    }

    if (hasFood && foodPayment === "gcash" && !settings?.ewallet_account_number) {
      toast.error("The business GCash account has not been configured yet.");
      return;
    }

    setSaving(true);

    try {
      const freshBusy = await getFreshBusySlots();
      const validationError = validateSelection(freshBusy);

      if (validationError) {
        toast.error(validationError);
        setStep(1);
        return;
      }

      const items = cartPayload(cart.items);

      // Create the reservation and associated food order with independent payment details.
      const { data: resId, error } = await supabase.rpc("create_reservation_v4", {
        _room_id: room.id,
        _date: date,
        _start: start,
        _end: addHours(start, hours),
        _guests: guests,
        _requests: requests,
        _items: items,

        // Room payment details
        _payment_method: roomPayment,
        _payer_name: roomPayment === "gcash" ? roomPayerName.trim() : null,
        _payer_account: roomPayment === "gcash" ? roomPayerAccount.trim() : null,
        _payment_ref: roomPayment === "gcash" ? roomPayRef.trim() : null,

        // Independent food payment details
        _food_payment_method: hasFood ? foodPayment : "cash",
        _food_payer_name: hasFood && foodPayment === "gcash" ? foodPayerName.trim() : null,
        _food_payer_account: hasFood && foodPayment === "gcash" ? foodPayerAccount.trim() : null,
        _food_payment_ref: hasFood && foodPayment === "gcash" ? foodPayRef.trim() : null,
      });

      if (error) {
        if (isOverlapDatabaseError(error)) {
          await qc.invalidateQueries({
            queryKey: ["busy", roomId, date],
          });

          toast.error(
            "Sorry, this room and time slot was just reserved by someone else. Please choose another time.",
          );

          setStep(1);
          return;
        }

        toast.error(errMsg(error));
        return;
      }

      if (!resId) {
        toast.error("The reservation could not be confirmed. Please contact SONARA.");
        return;
      }

      const { data: reservation, error: reservationFetchError } = await supabase
        .from("reservations")
        .select("reference_code")
        .eq("id", resId as string)
        .maybeSingle();

      if (reservationFetchError) {
        toast.error(
          "Your booking was created, but its reference could not be retrieved. Check My Transactions.",
        );
      }

      let foodOrderId: string | null = null;

      if (hasFood) {
        const { data: foodOrder, error: foodOrderError } = await supabase
          .from("food_orders")
          .select("id")
          .eq("reservation_id", resId as string)
          .maybeSingle();

        if (foodOrderError || !foodOrder) {
          toast.error(
            "Your room booking was created, but we could not retrieve the food order. Please contact SONARA before making another booking.",
          );
        } else {
          foodOrderId = foodOrder.id;
        }
      }

      // Submit room payment proof independently.
      let roomProofMessage: string | null = null;

      if (roomPayment === "gcash" && roomProof) {
        roomProofMessage = await uploadPaymentProof({
          targetType: "reservation",
          targetId: resId as string,
          file: roomProof,
          reference: roomPayRef,
          payerName: roomPayerName,
          payerAccount: roomPayerAccount,
        });
      }

      // Submit food payment proof independently.
      let foodProofMessage: string | null = null;

      if (foodOrderId && foodPayment === "gcash" && foodProof) {
        foodProofMessage = await uploadPaymentProof({
          targetType: "food_order",
          targetId: foodOrderId,
          file: foodProof,
          reference: foodPayRef,
          payerName: foodPayerName,
          payerAccount: foodPayerAccount,
        });
      }

      setReceipt({
        ref: reservation?.reference_code ?? "",
        date,
        start,
        hours,
        guests,
        roomPayment,
        foodPayment: hasFood ? foodPayment : null,
        roomProofMessage,
        foodProofMessage,
        roomTotal,
        foodTotal,
        items: cart.items.map((item) => ({
          name: item.name,
          qty: item.quantity,
          total: item.price * item.quantity,
        })),
      });

      cart.clear();

      await qc.invalidateQueries({
        queryKey: ["busy"],
      });

      await qc.invalidateQueries({
        queryKey: ["my-bookings"],
      });

      await qc.invalidateQueries({
        queryKey: ["room-status-reservations"],
      });

      setStep(4);

      if (roomProofMessage || foodProofMessage) {
        toast.warning(
          "Your booking was created, but one or more payment proofs could not be submitted. Please contact SONARA before paying again.",
        );
      } else {
        toast.success("Your booking has been submitted.");
      }
    } catch (error) {
      if (isOverlapDatabaseError(error)) {
        await qc.invalidateQueries({
          queryKey: ["busy", roomId, date],
        });

        toast.error(
          "Sorry, this room and time slot was just reserved by someone else. Please choose another time.",
        );

        setStep(1);
      } else {
        toast.error(errMsg(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const StepDots = () => (
    <div className="mt-3 flex gap-2 text-xs">
      {["Room & time", "Meals", "Review & pay"].map((label, i) => (
        <button
          type="button"
          key={label}
          disabled={step <= i + 1}
          onClick={() => {
            if (i === 0) setStep(1);
            else if (i === 1) setStep(2);
            else setStep(3);
          }}
          className={`rounded-full px-2.5 py-1 disabled:cursor-default ${
            step === i + 1
              ? "bg-primary text-primary-foreground"
              : step > i + 1
                ? "bg-secondary text-foreground"
                : "bg-secondary/40 text-muted-foreground"
          }`}
        >
          {i + 1}. {label}
        </button>
      ))}
    </div>
  );

  const PaymentStatusMessage = ({
    method,
    message,
  }: {
    method: PaymentMethod;
    message: string | null;
  }) => (
    <div className="mt-2 rounded-lg bg-secondary/40 p-3 text-sm">
      {method === "cash" ? (
        <p>Pay in cash at the counter. Your payment will be recorded by SONARA staff.</p>
      ) : message ? (
        <p className="text-destructive">
          {message} Please contact SONARA before submitting another payment.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Screenshot submitted. Your payment is awaiting verification by SONARA.
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <img
          src={room.image_url || ROOM_IMAGES[room.room_type]}
          alt={room.name}
          className="aspect-[16/10] w-full rounded-2xl object-cover"
        />

        <p className="mt-6 text-xs uppercase tracking-widest text-accent">
          Room {room.room_number} · {ROOM_TYPE_LABELS[room.room_type]}
        </p>

        <h1 className="mt-1 font-display text-4xl font-bold">{room.name}</h1>

        <p className="mt-3 text-muted-foreground">{room.description}</p>

        <div className="mt-4 flex gap-6 text-sm">
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4 text-primary" />
            Up to {room.capacity} guests
          </span>

          <span className="text-accent">{peso(room.hourly_rate)} / hour</span>
        </div>

        <ul className="mt-6 grid grid-cols-2 gap-2 text-sm">
          {room.amenities.map((amenity) => (
            <li key={amenity} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              {amenity}
            </li>
          ))}
        </ul>
      </div>

      <div className="h-fit rounded-2xl border border-border bg-card p-6 glow-primary">
        {step === 4 && receipt ? (
          <div className="space-y-4">
            <div className="text-center">
              <Check className="mx-auto h-10 w-10 rounded-full bg-primary p-2 text-primary-foreground" />

              <h2 className="mt-3 font-display text-2xl font-bold">Booking sent!</h2>

              <p className="text-sm text-muted-foreground">Waiting for approval</p>

              <p className="mt-2 font-display text-lg tracking-widest text-accent">
                {receipt.ref || "Reference pending"}
              </p>
            </div>

            <div className="space-y-1 rounded-lg bg-secondary/40 p-4 text-sm">
              <p className="font-medium">{room.name}</p>

              <p className="text-muted-foreground">
                {fmtDate(receipt.date)} · {fmtTime(receipt.start)} –{" "}
                {fmtTime(addHours(receipt.start, receipt.hours))} · {receipt.guests} guests
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Room ({receipt.hours} hr)</span>
                <span>{peso(receipt.roomTotal)}</span>
              </div>

              {receipt.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {item.qty}× {item.name}
                  </span>
                  <span>{peso(item.total)}</span>
                </div>
              ))}

              <div className="flex justify-between border-t border-border pt-2 font-display text-lg font-bold">
                <span>Combined booking total</span>
                <span className="text-accent">{peso(receipt.roomTotal + receipt.foodTotal)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">Room payment</p>

                  <span className="text-xs text-muted-foreground">
                    {receipt.roomPayment === "cash" ? "Cash" : "GCash"}
                  </span>
                </div>

                <p className="mt-1 text-sm font-semibold">{peso(receipt.roomTotal)}</p>

                <PaymentStatusMessage
                  method={receipt.roomPayment}
                  message={receipt.roomProofMessage}
                />
              </div>

              {receipt.foodPayment && (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">Food payment</p>

                    <span className="text-xs text-muted-foreground">
                      {receipt.foodPayment === "cash" ? "Cash" : "GCash"}
                    </span>
                  </div>

                  <p className="mt-1 text-sm font-semibold">{peso(receipt.foodTotal)}</p>

                  <PaymentStatusMessage
                    method={receipt.foodPayment}
                    message={receipt.foodProofMessage}
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              This is your booking confirmation, not an official payment receipt. Official payment
              receipts are issued after checkout and full payment verification.
            </p>

            <div className="flex gap-2">
              <Button asChild variant="glow" className="flex-1">
                <Link to="/my-bookings">View my transactions</Link>
              </Button>

              <Button asChild variant="outline">
                <Link to="/rooms">Book another</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="font-display text-xl font-bold">Book this room</h2>

            {bookable && <StepDots />}

            {!bookable ? (
              <p className="mt-4 text-muted-foreground">
                This room is not available for booking right now.
              </p>
            ) : step === 1 ? (
              <div className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="date">Date</Label>

                  <Input
                    id="date"
                    type="date"
                    min={today()}
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setStart("");
                    }}
                  />
                </div>

                <div>
                  <Label>Start time</Label>

                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {starts.map((time) => {
                      const past = isPastStart(date, time);
                      const tooShort = Number(time.slice(0, 2)) + minH > closeH;
                      const taken = isTaken(time, minH);
                      const unavailable = past || tooShort || taken;

                      return (
                        <button
                          key={time}
                          type="button"
                          disabled={unavailable}
                          onClick={() => {
                            setStart(time);

                            const availableHours = Array.from(
                              {
                                length: Math.max(0, maxH - minH + 1),
                              },
                              (_, i) => minH + i,
                            ).filter(
                              (h) => Number(time.slice(0, 2)) + h <= closeH && !isTaken(time, h),
                            );

                            setHours(availableHours[0] ?? minH);
                          }}
                          className={`rounded-md border px-2 py-2 text-sm transition ${
                            start === time
                              ? "border-primary bg-primary text-primary-foreground"
                              : unavailable
                                ? "border-border bg-muted text-muted-foreground"
                                : "border-border hover:border-primary/60"
                          } disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through`}
                        >
                          {fmtTime(time)}
                        </button>
                      );
                    })}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Unavailable times are disabled. Pending reservations also hold their selected
                    slots.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="hours">Hours</Label>

                    <select
                      id="hours"
                      className="mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                      disabled={!start}
                    >
                      {validDurations.map((duration) => {
                        const taken = isTaken(start, duration);

                        return (
                          <option
                            key={duration}
                            value={duration}
                            disabled={taken}
                            className="bg-popover"
                          >
                            {duration} hr
                            {duration > 1 ? "s" : ""}
                            {taken ? " (unavailable)" : ""}
                          </option>
                        );
                      })}
                    </select>

                    {start &&
                      validDurations.length > 0 &&
                      validDurations.every((duration) => isTaken(start, duration)) && (
                        <p className="mt-1 text-xs text-destructive">
                          No available duration for this start time.
                        </p>
                      )}
                  </div>

                  <div>
                    <Label htmlFor="guests">Guests</Label>

                    <Input
                      id="guests"
                      type="number"
                      min={1}
                      max={room.capacity}
                      value={guests}
                      onChange={(e) =>
                        setGuests(Math.max(1, Math.min(room.capacity, Number(e.target.value) || 1)))
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="req">Special requests</Label>

                  <Textarea
                    id="req"
                    maxLength={500}
                    value={requests}
                    onChange={(e) => setRequests(e.target.value)}
                    placeholder="Birthday setup, song requests…"
                  />
                </div>

                <div className="flex justify-between border-t border-border pt-4 text-sm">
                  <span className="text-muted-foreground">
                    Room ({hours} hr × {peso(room.hourly_rate)})
                  </span>
                  <span>{peso(roomTotal)}</span>
                </div>

                <Button
                  variant="glow"
                  className="w-full"
                  size="lg"
                  onClick={toMeals}
                  disabled={
                    !!user && (!start || validDurations.length === 0 || isTaken(start, hours))
                  }
                >
                  {user ? "Continue to meals" : "Sign in to book"}
                </Button>
              </div>
            ) : step === 2 ? (
              <div className="mt-5 space-y-4">
                <p className="rounded-lg bg-secondary/40 p-3 text-sm">
                  {fmtDate(date)} · {fmtTime(start)} – {fmtTime(addHours(start, hours))} · {guests}{" "}
                  guests
                </p>

                <p className="text-sm text-muted-foreground">
                  Want food and drinks ready when you arrive? Add them now — or skip.
                </p>

                <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {menuItems.map((item) => {
                    const quantity = qtyOf(item.id);

                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 rounded-lg border border-border p-2"
                      >
                        <img
                          src={item.image_url || foodImage(item.image_key)}
                          alt={item.name}
                          className="h-12 w-12 rounded-md object-cover"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.name}</p>

                          <p className="text-xs text-accent">{peso(item.price)}</p>
                        </div>

                        {quantity === 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              cart.add({
                                id: item.id,
                                name: item.name,
                                price: Number(item.price),
                                image_key: item.image_key,
                                image_url: item.image_url,
                              })
                            }
                          >
                            Add
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => cart.setQty(item.id, quantity - 1)}
                              aria-label={`Less ${item.name}`}
                            >
                              <Minus />
                            </Button>

                            <span className="w-5 text-center text-sm">{quantity}</span>

                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => cart.setQty(item.id, quantity + 1)}
                              aria-label={`More ${item.name}`}
                            >
                              <Plus />
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {menuItems.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No food or drinks are currently available for pre-order.
                  </p>
                )}

                <div className="flex justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">
                    Food ({cart.count} item
                    {cart.count === 1 ? "" : "s"})
                  </span>
                  <span>{peso(foodTotal)}</span>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>

                  <Button variant="glow" className="flex-1" onClick={() => setStep(3)}>
                    {cart.count === 0 ? "Skip meals" : "Continue to review"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="space-y-1 rounded-lg bg-secondary/40 p-4 text-sm">
                  <p className="font-medium">{room.name}</p>

                  <p className="text-muted-foreground">
                    {fmtDate(date)} · {fmtTime(start)} – {fmtTime(addHours(start, hours))} ·{" "}
                    {guests} guests
                  </p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Room ({hours} hr × {peso(room.hourly_rate)})
                    </span>
                    <span>{peso(roomTotal)}</span>
                  </div>

                  {cart.items.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {item.quantity}× {item.name}
                      </span>
                      <span>{peso(item.price * item.quantity)}</span>
                    </div>
                  ))}

                  <div className="flex justify-between border-t border-border pt-2 font-display text-lg font-bold">
                    <span>Combined total</span>
                    <span className="text-accent">{peso(roomTotal + foodTotal)}</span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Room and food payments are processed separately.
                  </p>
                </div>

                {/* ROOM PAYMENT */}
                <section className="space-y-2 rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display font-semibold">Room payment</h3>

                    <span className="text-sm font-semibold">{peso(roomTotal)}</span>
                  </div>

                  <Label>Payment method</Label>

                  <PaymentMethodSelector value={roomPayment} onChange={setRoomPayment} />

                  {roomPayment === "cash" ? (
                    <p className="text-sm text-muted-foreground">
                      Pay in cash at the counter when you check in.
                    </p>
                  ) : (
                    <GCashDetails
                      settings={settings}
                      payerName={roomPayerName}
                      setPayerName={setRoomPayerName}
                      payerAccount={roomPayerAccount}
                      setPayerAccount={setRoomPayerAccount}
                      payRef={roomPayRef}
                      setPayRef={setRoomPayRef}
                      proof={roomProof}
                      setProof={setRoomProof}
                      prefix="room"
                    />
                  )}
                </section>

                {/* FOOD PAYMENT */}
                {hasFood && (
                  <section className="space-y-2 rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display font-semibold">Food payment</h3>

                      <span className="text-sm font-semibold">{peso(foodTotal)}</span>
                    </div>

                    <Label>Payment method</Label>

                    <PaymentMethodSelector value={foodPayment} onChange={setFoodPayment} />

                    {foodPayment === "cash" ? (
                      <p className="text-sm text-muted-foreground">
                        Pay for your food order separately in cash at the lounge.
                      </p>
                    ) : (
                      <GCashDetails
                        settings={settings}
                        payerName={foodPayerName}
                        setPayerName={setFoodPayerName}
                        payerAccount={foodPayerAccount}
                        setPayerAccount={setFoodPayerAccount}
                        payRef={foodPayRef}
                        setPayRef={setFoodPayRef}
                        proof={foodProof}
                        setProof={setFoodProof}
                        prefix="food"
                      />
                    )}
                  </section>
                )}

                <p className="text-xs text-muted-foreground">
                  GCash payments remain unpaid until SONARA verifies the submitted screenshots.
                  Bookings also require admin approval.
                </p>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>
                    Back
                  </Button>

                  <Button
                    variant="glow"
                    className="flex-1"
                    size="lg"
                    onClick={submit}
                    disabled={saving}
                  >
                    {saving ? "Submitting booking…" : "Confirm booking"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
