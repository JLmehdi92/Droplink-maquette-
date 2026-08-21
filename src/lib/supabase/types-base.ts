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
      admin_audit_log: {
        Row: {
          action: string
          admin_email: string
          admin_id: string | null
          id: string
          ip_hash: string | null
          occurred_at: string
          payload: Json
          resource_id: string | null
          resource_type: string
          target_email: string | null
          target_profile_id: string | null
        }
        Insert: {
          action: string
          admin_email: string
          admin_id?: string | null
          id?: string
          ip_hash?: string | null
          occurred_at?: string
          payload?: Json
          resource_id?: string | null
          resource_type: string
          target_email?: string | null
          target_profile_id?: string | null
        }
        Update: {
          action?: string
          admin_email?: string
          admin_id?: string | null
          id?: string
          ip_hash?: string | null
          occurred_at?: string
          payload?: Json
          resource_id?: string | null
          resource_type?: string
          target_email?: string | null
          target_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      link_views: {
        Row: {
          country: string | null
          id: string
          ip_hash: string
          order_id: string
          user_agent_hash: string
          viewed_at: string
          viewed_on: string | null
        }
        Insert: {
          country?: string | null
          id?: string
          ip_hash: string
          order_id: string
          user_agent_hash: string
          viewed_at?: string
          viewed_on?: string | null
        }
        Update: {
          country?: string | null
          id?: string
          ip_hash?: string
          order_id?: string
          user_agent_hash?: string
          viewed_at?: string
          viewed_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_views_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor: string
          id: string
          occurred_at: string
          order_id: string
          payload: Json
          type: string
        }
        Insert: {
          actor: string
          id?: string
          occurred_at?: string
          order_id: string
          payload?: Json
          type: string
        }
        Update: {
          actor?: string
          id?: string
          occurred_at?: string
          order_id?: string
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_media: {
        Row: {
          cle: string
          cle_vignette: string | null
          created_at: string
          duree_s: number | null
          hauteur: number | null
          id: string
          largeur: number | null
          order_id: string
          position: number
          source: Database["public"]["Enums"]["media_source"]
          taille_octets: number
          type: Database["public"]["Enums"]["media_type"]
        }
        Insert: {
          cle: string
          cle_vignette?: string | null
          created_at?: string
          duree_s?: number | null
          hauteur?: number | null
          id?: string
          largeur?: number | null
          order_id: string
          position: number
          source?: Database["public"]["Enums"]["media_source"]
          taille_octets: number
          type: Database["public"]["Enums"]["media_type"]
        }
        Update: {
          cle?: string
          cle_vignette?: string | null
          created_at?: string
          duree_s?: number | null
          hauteur?: number | null
          id?: string
          largeur?: number | null
          order_id?: string
          position?: number
          source?: Database["public"]["Enums"]["media_source"]
          taille_octets?: number
          type?: Database["public"]["Enums"]["media_type"]
        }
        Relationships: [
          {
            foreignKeyName: "order_media_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_parcels: {
        Row: {
          order_id: string
          parcel_id: string
        }
        Insert: {
          order_id: string
          parcel_id: string
        }
        Update: {
          order_id?: string
          parcel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_parcels_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_parcels_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "tracked_parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          archived_at: string | null
          carrier_code: string | null
          cover_media_id: string | null
          created_at: string
          created_event_at: string | null
          customer_label: string | null
          first_content_at: string | null
          id: string
          internal_notes: string | null
          last_viewed_at: string | null
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
          views_count: number
        }
        Insert: {
          archived_at?: string | null
          carrier_code?: string | null
          cover_media_id?: string | null
          created_at?: string
          created_event_at?: string | null
          customer_label?: string | null
          first_content_at?: string | null
          id?: string
          internal_notes?: string | null
          last_viewed_at?: string | null
          notify_email?: string | null
          product_ref?: string | null
          public_token: string
          qc_status?: Database["public"]["Enums"]["qc_status"]
          recherche?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["order_status"]
          tracking_number?: string | null
          unsubscribe_token: string
          updated_at?: string
          views_count?: number
        }
        Update: {
          archived_at?: string | null
          carrier_code?: string | null
          cover_media_id?: string | null
          created_at?: string
          created_event_at?: string | null
          customer_label?: string | null
          first_content_at?: string | null
          id?: string
          internal_notes?: string | null
          last_viewed_at?: string | null
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
          views_count?: number
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
      parcel_checkpoints: {
        Row: {
          created_at: string
          description: string
          id: string
          location: string | null
          occurred_at: string
          parcel_id: string
          stage: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          location?: string | null
          occurred_at: string
          parcel_id: string
          stage?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          location?: string | null
          occurred_at?: string
          parcel_id?: string
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcel_checkpoints_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "tracked_parcels"
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
      scheduler_heartbeat: {
        Row: {
          beat_at: string
          detail: Json
          source: string
        }
        Insert: {
          beat_at?: string
          detail?: Json
          source: string
        }
        Update: {
          beat_at?: string
          detail?: Json
          source?: string
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
      tracked_parcels: {
        Row: {
          abandoned_at: string | null
          carrier_code: number | null
          created_at: string
          empty_count: number
          estimated_from: string | null
          estimated_to: string | null
          first_movement_at: string | null
          id: string
          immobile_depuis: string | null
          last_movement_at: string | null
          last_query_at: string | null
          normalized_status: Database["public"]["Enums"]["parcel_status"]
          query_count: number
          raw_status: string | null
          registered_at: string | null
          shop_id: string
          tracking_number: string
          updated_at: string
        }
        Insert: {
          abandoned_at?: string | null
          carrier_code?: number | null
          created_at?: string
          empty_count?: number
          estimated_from?: string | null
          estimated_to?: string | null
          first_movement_at?: string | null
          id?: string
          immobile_depuis?: string | null
          last_movement_at?: string | null
          last_query_at?: string | null
          normalized_status?: Database["public"]["Enums"]["parcel_status"]
          query_count?: number
          raw_status?: string | null
          registered_at?: string | null
          shop_id: string
          tracking_number: string
          updated_at?: string
        }
        Update: {
          abandoned_at?: string | null
          carrier_code?: number | null
          created_at?: string
          empty_count?: number
          estimated_from?: string | null
          estimated_to?: string | null
          first_movement_at?: string | null
          id?: string
          immobile_depuis?: string | null
          last_movement_at?: string | null
          last_query_at?: string | null
          normalized_status?: Database["public"]["Enums"]["parcel_status"]
          query_count?: number
          raw_status?: string | null
          registered_at?: string | null
          shop_id?: string
          tracking_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_parcels_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_snapshots: {
        Row: {
          fetched_at: string
          id: string
          normalized_status: Database["public"]["Enums"]["parcel_status"] | null
          parcel_id: string
          raw_payload: Json
        }
        Insert: {
          fetched_at?: string
          id?: string
          normalized_status?:
            | Database["public"]["Enums"]["parcel_status"]
            | null
          parcel_id: string
          raw_payload: Json
        }
        Update: {
          fetched_at?: string
          id?: string
          normalized_status?:
            | Database["public"]["Enums"]["parcel_status"]
            | null
          parcel_id?: string
          raw_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tracking_snapshots_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "tracked_parcels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandonner_colis: {
        Args: { p_motif: string; p_parcel_id: string }
        Returns: undefined
      }
      analyser_activite: {
        Args: { p_depuis: string }
        Returns: {
          archivees: number
          avec_suivi: number
          commandes_creees: number
          commandes_ouvertes: number
          qc_approuve: number
          qc_en_attente: number
          qc_refuse: number
          vues_totales: number
        }[]
      }
      appliquer_etat_colis: {
        Args: {
          p_brut: Json
          p_estimation_au: string
          p_estimation_du: string
          p_etape: Database["public"]["Enums"]["parcel_status"]
          p_numero: string
          p_points: Json
          p_statut_brut: string
          p_transporteur: string
        }
        Returns: number
      }
      arbitrer_qc: {
        Args: { p_commentaire: string; p_decision: string; p_jeton: string }
        Returns: Database["public"]["Enums"]["qc_status"]
      }
      archiver_lot: {
        Args: { p_archiver: boolean; p_ids: string[] }
        Returns: number
      }
      attacher_colis: {
        Args: { p_numero: string; p_order_id: string; p_transporteur: string }
        Returns: {
          cree: boolean
          parcel_id: string
        }[]
      }
      battre: { Args: { p_detail: Json; p_source: string }; Returns: undefined }
      colis_a_interroger: {
        Args: { p_limite: number }
        Returns: {
          carrier_code: number
          empty_count: number
          id: string
          last_movement_at: string
          last_query_at: string
          normalized_status: Database["public"]["Enums"]["parcel_status"]
          registered_at: string
          tracking_number: string
        }[]
      }
      compter_envois: {
        Args: { p_silence_jours: number }
        Returns: {
          abandonnes: number
          en_transit: number
          expedie: number
          livre: number
          preparation: number
          silencieux: number
          total: number
        }[]
      }
      compter_interrogation_vide: {
        Args: { p_numero: string }
        Returns: number
      }
      consommer_quota: {
        Args: { p_cle: string; p_fenetre_secondes: number; p_plafond: number }
        Returns: boolean
      }
      enregistrer_vue: {
        Args: {
          p_ip_hash: string
          p_jeton: string
          p_pays: string
          p_profil: string
          p_ua_hash: string
        }
        Returns: boolean
      }
      est_admin: { Args: never; Returns: boolean }
      fenetre_courante: {
        Args: { p_fenetre_secondes: number }
        Returns: string
      }
      generer_jeton_public: { Args: never; Returns: string }
      journaliser: {
        Args: {
          p_actor: string
          p_order_id: string
          p_payload?: Json
          p_type: string
        }
        Returns: string
      }
      journaliser_admin: {
        Args: {
          p_action: string
          p_cible: string
          p_ip_hash: string
          p_payload: Json
          p_resource_id: string
          p_resource_type: string
        }
        Returns: string
      }
      journaliser_vendeur: {
        Args: { p_order_id: string; p_payload?: Json; p_type: string }
        Returns: string
      }
      lire_commande_publique: {
        Args: { p_jeton: string }
        Returns: {
          boutique_couleur: string
          boutique_filigrane: boolean
          boutique_langue: string
          boutique_logo: string
          boutique_nom: string
          client: string
          couverture: string
          creee_le: string
          jeton: string
          modifiee_le: string
          numero_suivi: string
          reference: string
          statut: Database["public"]["Enums"]["order_status"]
          statut_qc: Database["public"]["Enums"]["qc_status"]
          transporteur: string
        }[]
      }
      lire_compte_admin: {
        Args: { p_ip_hash: string; p_profil: string }
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          boutique_id: string
          boutique_nom: string
          colis: number
          commandes: number
          created_at: string
          email: string
          id: string
          locale: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          vues: number
        }[]
      }
      lire_journal_admin: {
        Args: { p_curseur_date: string; p_curseur_id: string; p_limite: number }
        Returns: {
          action: string
          admin_email: string
          id: string
          motif: string
          occurred_at: string
          resource_id: string
          resource_type: string
          target_email: string
        }[]
      }
      lire_medias_publics: {
        Args: { p_jeton: string }
        Returns: {
          cle: string
          cle_vignette: string
          duree_s: number
          hauteur: number
          id: string
          largeur: number
          rang: number
          type: Database["public"]["Enums"]["media_type"]
        }[]
      }
      lire_passages_publics: {
        Args: { p_jeton: string }
        Returns: {
          description: string
          location: string
          occurred_at: string
          stage: string
        }[]
      }
      lire_suivi_public: {
        Args: { p_jeton: string }
        Returns: {
          abandonne: boolean
          dernier_mouvement: string
          estimation_au: string
          estimation_du: string
          etape: Database["public"]["Enums"]["parcel_status"]
          numero: string
          premier_mouvement: string
        }[]
      }
      lister_comptes_admin: {
        Args: {
          p_curseur_date: string
          p_curseur_id: string
          p_ip_hash: string
          p_limite: number
          p_recherche: string
        }
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          boutique_nom: string
          commandes: number
          created_at: string
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
        }[]
      }
      marquer_interroge: { Args: { p_parcel_id: string }; Returns: undefined }
      marquer_prise_en_charge: {
        Args: { p_abandonne: boolean; p_parcel_id: string }
        Returns: undefined
      }
      mon_shop_id: { Args: never; Returns: string }
      quota_depasse: {
        Args: { p_cle: string; p_fenetre_secondes: number; p_plafond: number }
        Returns: boolean
      }
      reactiver_compte: {
        Args: { p_ip_hash: string; p_motif: string; p_profil: string }
        Returns: boolean
      }
      reclamer_evenement_creation: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      regenerer_jeton_public: { Args: { p_order_id: string }; Returns: string }
      reordonner_medias: {
        Args: { p_ids: string[]; p_order_id: string }
        Returns: number
      }
      sans_accents: { Args: { p_texte: string }; Returns: string }
      suspendre_compte: {
        Args: { p_ip_hash: string; p_motif: string; p_profil: string }
        Returns: boolean
      }
    }
    Enums: {
      account_status: "active" | "suspended"
      account_type: "supplier" | "reseller"
      media_source: "upload" | "agent_import"
      media_type: "photo" | "video"
      order_status: "preparation" | "expedie" | "en_transit" | "livre"
      parcel_status: "preparation" | "expedie" | "en_transit" | "livre"
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
      media_source: ["upload", "agent_import"],
      media_type: ["photo", "video"],
      order_status: ["preparation", "expedie", "en_transit", "livre"],
      parcel_status: ["preparation", "expedie", "en_transit", "livre"],
      qc_status: ["en_attente", "approuve", "refuse"],
      user_role: ["user", "admin"],
    },
  },
} as const
