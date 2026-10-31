export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      business_settings: {
        Row: {
          address: string
          business_name: string
          cancellation_note: string
          closing_time: string
          contact_email: string
          contact_phone: string
          ewallet_account_name: string
          ewallet_account_number: string
          ewallet_instructions: string
          ewallet_provider: string
          id: number
          max_duration_hours: number
          min_duration_hours: number
          opening_time: string
          updated_at: string
        }
        Insert: {
          address?: string
          business_name?: string
          cancellation_note?: string
          closing_time?: string
          contact_email?: string
          contact_phone?: string
          ewallet_account_name?: string
          ewallet_account_number?: string
          ewallet_instructions?: string
          ewallet_provider?: string
          id?: number
          max_duration_hours?: number
          min_duration_hours?: number
          opening_time?: string
          updated_at?: string
        }
        Update: {
          address?: string
          business_name?: string
          cancellation_note?: string
          closing_time?: string
          contact_email?: string
          contact_phone?: string
          ewallet_account_name?: string
          ewallet_account_number?: string
          ewallet_instructions?: string
          ewallet_provider?: string
          id?: number
          max_duration_hours?: number
          min_duration_hours?: number
          opening_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          is_read: boolean
          message: string
          name: string
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_read?: boolean
          message: string
          name: string
          subject: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_read?: boolean
          message?: string
          name?: string
          subject?: string
        }
        Relationships: []
      }
      food_order_items: {
        Row: {
          food_order_id: string
          id: string
          item_name_snapshot: string
          line_total: number
          menu_item_id: string | null
          quantity: number
          unit_price_snapshot: number
        }
        Insert: {
          food_order_id: string
          id?: string
          item_name_snapshot: string
          line_total: number
          menu_item_id?: string | null
          quantity: number
          unit_price_snapshot: number
        }
        Update: {
          food_order_id?: string
          id?: string
          item_name_snapshot?: string
          line_total?: number
          menu_item_id?: string | null
          quantity?: number
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "food_order_items_food_order_id_fkey"
            columns: ["food_order_id"]
            isOneToOne: false
            referencedRelation: "food_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      food_orders: {
        Row: {
          created_at: string
          food_subtotal: number
          id: string
          order_type: Database["public"]["Enums"]["food_order_type"]
          payer_account_number: string | null
          payer_name: string | null
          payment_method: string
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          reference_code: string
          reservation_id: string
          served_at: string | null
          special_instructions: string | null
          status: Database["public"]["Enums"]["food_order_status"]
          submitted_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_subtotal?: number
          id?: string
          order_type: Database["public"]["Enums"]["food_order_type"]
          payer_account_number?: string | null
          payer_name?: string | null
          payment_method?: string
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reference_code?: string
          reservation_id: string
          served_at?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["food_order_status"]
          submitted_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          food_subtotal?: number
          id?: string
          order_type?: Database["public"]["Enums"]["food_order_type"]
          payer_account_number?: string | null
          payer_name?: string | null
          payment_method?: string
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reference_code?: string
          reservation_id?: string
          served_at?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["food_order_status"]
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_orders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_key: string | null
          image_url: string | null
          is_available: boolean
          is_featured: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_key?: string | null
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_key?: string | null
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      reservations: {
        Row: {
          booking_date: string
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string
          end_time: string
          guest_count: number
          id: string
          payer_account_number: string | null
          payer_name: string | null
          payment_method: string
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          reference_code: string
          rejection_reason: string | null
          room_id: string
          room_rate_snapshot: number
          room_total: number
          special_requests: string | null
          start_time: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_date: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          end_time: string
          guest_count: number
          id?: string
          payer_account_number?: string | null
          payer_name?: string | null
          payment_method?: string
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reference_code?: string
          rejection_reason?: string | null
          room_id: string
          room_rate_snapshot: number
          room_total: number
          special_requests?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_date?: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          end_time?: string
          guest_count?: number
          id?: string
          payer_account_number?: string | null
          payer_name?: string | null
          payment_method?: string
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reference_code?: string
          rejection_reason?: string | null
          room_id?: string
          room_rate_snapshot?: number
          room_total?: number
          special_requests?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          amenities: string[]
          capacity: number
          created_at: string
          description: string
          hourly_rate: number
          id: string
          image_url: string | null
          is_active: boolean
          maintenance_status: boolean
          name: string
          room_number: string
          room_type: Database["public"]["Enums"]["room_type"]
          updated_at: string
        }
        Insert: {
          amenities?: string[]
          capacity: number
          created_at?: string
          description?: string
          hourly_rate: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          maintenance_status?: boolean
          name: string
          room_number: string
          room_type: Database["public"]["Enums"]["room_type"]
          updated_at?: string
        }
        Update: {
          amenities?: string[]
          capacity?: number
          created_at?: string
          description?: string
          hourly_rate?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          maintenance_status?: boolean
          name?: string
          room_number?: string
          room_type?: Database["public"]["Enums"]["room_type"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_my_reservation: {
        Args: { _reservation_id: string }
        Returns: undefined
      }
      create_in_room_order: {
        Args: {
          _items: Json
          _notes: string
          _payer_account?: string
          _payer_name?: string
          _payment_method?: string
          _payment_ref?: string
          _reservation_id: string
        }
        Returns: string
      }
      create_reservation: {
        Args: {
          _date: string
          _end: string
          _guests: number
          _items?: Json
          _requests: string
          _room_id: string
          _start: string
        }
        Returns: string
      }
      create_reservation_v2: {
        Args: {
          _date: string
          _end: string
          _guests: number
          _items?: Json
          _payment_method?: string
          _requests: string
          _room_id: string
          _start: string
        }
        Returns: string
      }
      create_reservation_v3: {
        Args: {
          _date: string
          _end: string
          _guests: number
          _items: Json
          _payer_account?: string
          _payer_name?: string
          _payment_method: string
          _payment_ref?: string
          _requests: string
          _room_id: string
          _start: string
        }
        Returns: string
      }
      expire_no_show_reservations: { Args: never; Returns: undefined }
      get_room_busy_slots: {
        Args: { _date: string; _room_id: string }
        Returns: {
          end_time: string
          start_time: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "customer"
      food_order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "served"
        | "cancelled"
      food_order_type: "pre_order" | "in_room"
      payment_status: "unpaid" | "paid"
      reservation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "checked_in"
        | "completed"
      room_type: "small" | "medium" | "large" | "vip"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "customer"],
      food_order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "served",
        "cancelled",
      ],
      food_order_type: ["pre_order", "in_room"],
      payment_status: ["unpaid", "paid"],
      reservation_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "checked_in",
        "completed",
      ],
      room_type: ["small", "medium", "large", "vip"],
    },
  },
} as const
