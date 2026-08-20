// GÉNÉRÉ PAR `pnpm db:types` — NE PAS MODIFIER À LA MAIN.
// Source de vérité : le schéma réellement appliqué en base.

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      orders: {
        Row: {
          archived_at: string | null
          carrier_code: string | null
          cover_media_id: string | null
          created_at: string
          customer_label: string | null
          first_content_at: string | null
          id: string
          internal_notes: string | null
          notify_email: string | null
          product_ref: string | null
          public_token: string
          qc_status: Database["public"]["Enums"]["qc_status"]
          recherche: string | null
          shop_id: string
          status: Database["public"]["Enums"]["order_status"]
          tracking_number: string | null
          unsubscribe_token: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          carrier_code?: string | null
          cover_media_id?: string | null
          created_at?: string
          customer_label?: string | null
          first_content_at?: string | null
          id?: string
          internal_notes?: string | null
          notify_email?: string | null
          product_ref?: string | null
          public_token?: string
          qc_status?: Database["public"]["Enums"]["qc_status"]
          recherche?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["order_status"]
          tracking_number?: string | null
          unsubscribe_token?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          carrier_code?: string | null
          cover_media_id?: string | null
          created_at?: string
          customer_label?: string | null
          first_content_at?: string | null
          id?: string
          internal_notes?: string | null
          notify_email?: string | null
          product_ref?: string | null
          public_token?: string
          qc_status?: Database["public"]["Enums"]["qc_status"]
          recherche?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          tracking_number?: string | null
          unsubscribe_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          created_at: string
          email: string
          id: string
          locale: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          user_id: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          created_at?: string
          email: string
          id?: string
          locale?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          user_id: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null
          created_at?: string
          email?: string
          id?: string
          locale?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          user_id?: string
        }
        Relationships: []
      }
      rate_limit: {
        Row: {
          cle: string
          compte: number
          fenetre_debut: string
        }
        Insert: {
          cle: string
          compte?: number
          fenetre_debut: string
        }
        Update: {
          cle?: string
          compte?: number
          fenetre_debut?: string
        }
        Relationships: []
      }
      shops: {
        Row: {
          accent_color: string
          created_at: string
          default_language: string
          id: string
          logo_url: string | null
          name: string | null
          owner_id: string
          slug: string | null
          updated_at: string
          watermark_enabled: boolean
        }
        Insert: {
          accent_color?: string
          created_at?: string
          default_language?: string
          id?: string
          logo_url?: string | null
          name?: string | null
          owner_id: string
          slug?: string | null
          updated_at?: string
          watermark_enabled?: boolean
        }
        Update: {
          accent_color?: string
          created_at?: string
          default_language?: string
          id?: string
          logo_url?: string | null
          name?: string | null
          owner_id?: string
          slug?: string | null
          updated_at?: string
          watermark_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "shops_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consommer_quota: {
        Args: { p_cle: string; p_fenetre_secondes: number; p_plafond: number }
        Returns: boolean
      }
      generer_jeton_public: { Args: never; Returns: string }
      mon_shop_id: { Args: never; Returns: string }
      regenerer_jeton_public: { Args: { p_order_id: string }; Returns: string }
      sans_accents: { Args: { p_texte: string }; Returns: string }
    }
    Enums: {
      account_status: "active" | "suspended"
      account_type: "supplier" | "reseller"
      order_status: "preparation" | "expedie" | "en_transit" | "livre"
      qc_status: "en_attente" | "approuve" | "refuse"
      user_role: "user" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      account_status: ["active", "suspended"],
      account_type: ["supplier", "reseller"],
      order_status: ["preparation", "expedie", "en_transit", "livre"],
      qc_status: ["en_attente", "approuve", "refuse"],
      user_role: ["user", "admin"],
    },
  },
} as const
