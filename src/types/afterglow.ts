// Afterglow domain types — mirror the public database tables (snake_case columns).

export type RoomType = "small" | "medium" | "large" | "vip";

export type ReservationStatus =
  "pending" | "approved" | "rejected" | "cancelled" | "checked_in" | "completed";

export type FoodOrderType = "pre_order" | "in_room";

export type FoodOrderStatus =
  "pending" | "confirmed" | "preparing" | "ready" | "served" | "cancelled";

export type PaymentStatus = "unpaid" | "paid";

export interface Profile {
  id: string;
  full_name: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  room_number: string;
  name: string;
  room_type: RoomType;
  capacity: number;
  hourly_rate: number;
  description: string;
  image_url: string | null;
  amenities: string[];
  is_active: boolean;
  maintenance_status: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomImage {
  id: string;
  room_id: string;
  image_url: string;
  sort_order: number;
}

export interface Reservation {
  id: string;
  reference_code: string;
  user_id: string;
  room_id: string;
  booking_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  guest_count: number;
  room_rate_snapshot: number;
  room_total: number;
  special_requests: string | null;
  status: ReservationStatus;
  payment_status: PaymentStatus;
  payment_method: "cash" | "gcash";
  rejection_reason: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationWithRoom extends Reservation {
  room: Room | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItemWithCategory extends MenuItem {
  menu_categories: Pick<MenuCategory, "id" | "name"> | null;
}

export interface FoodOrderItem {
  id: string;
  food_order_id: string;
  menu_item_id: string | null;
  item_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_total: number;
}

export interface FoodOrder {
  id: string;
  reference_code: string;
  user_id: string;
  reservation_id: string;
  order_type: FoodOrderType;
  status: FoodOrderStatus;
  food_subtotal: number;
  special_instructions: string | null;
  submitted_at: string | null;
  served_at: string | null;
  created_at: string;
}

export interface FoodOrderWithDetails extends FoodOrder {
  room: Pick<Room, "id" | "room_number" | "name"> | null;
  food_order_items: FoodOrderItem[];
  profiles: Pick<Profile, "id" | "full_name"> | null;
  reservations: Pick<Reservation, "id" | "reference_code" | "booking_date"> | null;
}

export interface BusinessSettings {
  id: string;
  business_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  opening_time: string; // HH:MM
  closing_time: string; // HH:MM
  min_duration_hours: number;
  max_duration_hours: number;
  min_advance_hours: number;
  max_advance_days: number;
  cancellation_note: string;
  updated_at: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface CartLine {
  item: MenuItem;
  quantity: number;
}

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  checked_in: "Checked In",
  completed: "Completed",
};

export const FOOD_ORDER_STATUS_LABELS: Record<FoodOrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  vip: "VIP",
};
