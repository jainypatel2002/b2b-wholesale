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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      business_profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          business_name: string | null
          city: string | null
          contact_name: string | null
          country: string
          created_at: string
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          tax_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          business_name?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          business_name?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          distributor_id: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          distributor_id: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          distributor_id?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      category_nodes: {
        Row: {
          category_id: string
          created_at: string
          deleted_at: string | null
          distributor_id: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          deleted_at?: string | null
          distributor_id: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          deleted_at?: string | null
          distributor_id?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_nodes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_nodes_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "category_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_feature_settings: {
        Row: {
          created_at: string
          distributor_id: string
          updated_at: string
          vendor_can_view_margin: boolean
        }
        Insert: {
          created_at?: string
          distributor_id: string
          updated_at?: string
          vendor_can_view_margin?: boolean
        }
        Update: {
          created_at?: string
          distributor_id?: string
          updated_at?: string
          vendor_can_view_margin?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "distributor_feature_settings_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_settings: {
        Row: {
          created_at: string
          distributor_id: string
          notification_email: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          distributor_id: string
          notification_email: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          distributor_id?: string
          notification_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      distributor_signup_code_redemptions: {
        Row: {
          code_id: string
          email: string | null
          id: string
          ip: string | null
          redeemed_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          code_id: string
          email?: string | null
          id?: string
          ip?: string | null
          redeemed_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          code_id?: string
          email?: string | null
          id?: string
          ip?: string | null
          redeemed_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_signup_code_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "distributor_signup_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      distributor_signup_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          max_uses: number
          note: string | null
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          max_uses?: number
          note?: string | null
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          max_uses?: number
          note?: string | null
          uses_count?: number
        }
        Relationships: []
      }
      distributor_vendors: {
        Row: {
          created_at: string
          distributor_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          distributor_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          distributor_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_vendors_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distributor_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          attempts: number
          created_at: string
          distributor_id: string | null
          event_key: string
          event_type: string | null
          html: string | null
          id: string
          last_error: string | null
          order_id: string | null
          payload: Json
          sent_at: string | null
          status: string
          subject: string | null
          to_email: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          distributor_id?: string | null
          event_key: string
          event_type?: string | null
          html?: string | null
          id?: string
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          distributor_id?: string | null
          event_key?: string
          event_type?: string | null
          html?: string | null
          id?: string
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          case_price_snapshot: number | null
          cases_qty: number | null
          category_id: string | null
          category_label: string | null
          category_name: string | null
          category_name_snapshot: string | null
          created_at: string
          effective_units: number | null
          ext_amount: number | null
          id: string
          invoice_id: string
          is_manual: boolean
          item_code: string | null
          line_total_snapshot: number | null
          order_mode: string | null
          order_unit: string
          pieces_qty: number | null
          product_id: string | null
          product_name: string | null
          product_name_snapshot: string | null
          qty: number
          quantity_snapshot: number | null
          total_pieces: number | null
          unit_cost: number
          unit_price: number
          unit_price_snapshot: number | null
          units_per_case_snapshot: number | null
          upc: string | null
        }
        Insert: {
          case_price_snapshot?: number | null
          cases_qty?: number | null
          category_id?: string | null
          category_label?: string | null
          category_name?: string | null
          category_name_snapshot?: string | null
          created_at?: string
          effective_units?: number | null
          ext_amount?: number | null
          id?: string
          invoice_id: string
          is_manual?: boolean
          item_code?: string | null
          line_total_snapshot?: number | null
          order_mode?: string | null
          order_unit?: string
          pieces_qty?: number | null
          product_id?: string | null
          product_name?: string | null
          product_name_snapshot?: string | null
          qty: number
          quantity_snapshot?: number | null
          total_pieces?: number | null
          unit_cost: number
          unit_price: number
          unit_price_snapshot?: number | null
          units_per_case_snapshot?: number | null
          upc?: string | null
        }
        Update: {
          case_price_snapshot?: number | null
          cases_qty?: number | null
          category_id?: string | null
          category_label?: string | null
          category_name?: string | null
          category_name_snapshot?: string | null
          created_at?: string
          effective_units?: number | null
          ext_amount?: number | null
          id?: string
          invoice_id?: string
          is_manual?: boolean
          item_code?: string | null
          line_total_snapshot?: number | null
          order_mode?: string | null
          order_unit?: string
          pieces_qty?: number | null
          product_id?: string | null
          product_name?: string | null
          product_name_snapshot?: string | null
          qty?: number
          quantity_snapshot?: number | null
          total_pieces?: number | null
          unit_cost?: number
          unit_price?: number
          unit_price_snapshot?: number | null
          units_per_case_snapshot?: number | null
          upc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_taxes: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          name: string
          rate_percent: number | null
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id: string
          name: string
          rate_percent?: number | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          name?: string
          rate_percent?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_taxes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          buyer_profile: Json | null
          created_at: string
          credit_applied: number
          deleted_at: string | null
          distributor_id: string
          id: string
          invoice_number: string
          notes: string | null
          order_id: string
          paid_at: string | null
          payment_method: string
          payment_status: string
          seller_profile: Json | null
          subtotal: number
          tax: number
          tax_total: number
          terms: string | null
          total: number
          vendor_id: string
        }
        Insert: {
          buyer_profile?: Json | null
          created_at?: string
          credit_applied?: number
          deleted_at?: string | null
          distributor_id: string
          id?: string
          invoice_number: string
          notes?: string | null
          order_id: string
          paid_at?: string | null
          payment_method?: string
          payment_status?: string
          seller_profile?: Json | null
          subtotal?: number
          tax?: number
          tax_total?: number
          terms?: string | null
          total?: number
          vendor_id: string
        }
        Update: {
          buyer_profile?: Json | null
          created_at?: string
          credit_applied?: number
          deleted_at?: string | null
          distributor_id?: string
          id?: string
          invoice_number?: string
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          payment_method?: string
          payment_status?: string
          seller_profile?: Json | null
          subtotal?: number
          tax?: number
          tax_total?: number
          terms?: string | null
          total?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          ref_id: string | null
          ref_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          ref_id?: string | null
          ref_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          ref_id?: string | null
          ref_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_adjustments: {
        Row: {
          amount: number
          created_at: string
          id: string
          name: string
          order_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          name: string
          order_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          name?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_credit_applications: {
        Row: {
          applied_amount: number
          created_at: string
          created_by: string
          distributor_id: string
          id: string
          invoice_id: string | null
          note: string | null
          order_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          applied_amount: number
          created_at?: string
          created_by: string
          distributor_id: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          order_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          applied_amount?: number
          created_at?: string
          created_by?: string
          distributor_id?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          order_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_credit_applications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_credit_applications_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_credit_applications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_credit_applications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_credit_applications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          case_price_snapshot: number | null
          cases_qty: number | null
          cost_price_at_time: number | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          edited_name: string | null
          edited_qty: number | null
          edited_unit_price: number | null
          id: string
          order_id: string
          order_unit: string
          pieces_qty: number | null
          product_id: string
          product_name: string | null
          qty: number
          removed: boolean
          selling_price_at_time: number | null
          total_pieces: number | null
          unit_cost: number
          unit_price: number
          unit_price_snapshot: number
          units_per_case_snapshot: number | null
        }
        Insert: {
          case_price_snapshot?: number | null
          cases_qty?: number | null
          cost_price_at_time?: number | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          edited_name?: string | null
          edited_qty?: number | null
          edited_unit_price?: number | null
          id?: string
          order_id: string
          order_unit?: string
          pieces_qty?: number | null
          product_id: string
          product_name?: string | null
          qty: number
          removed?: boolean
          selling_price_at_time?: number | null
          total_pieces?: number | null
          unit_cost: number
          unit_price: number
          unit_price_snapshot?: number
          units_per_case_snapshot?: number | null
        }
        Update: {
          case_price_snapshot?: number | null
          cases_qty?: number | null
          cost_price_at_time?: number | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          edited_name?: string | null
          edited_qty?: number | null
          edited_unit_price?: number | null
          id?: string
          order_id?: string
          order_unit?: string
          pieces_qty?: number | null
          product_id?: string
          product_name?: string | null
          qty?: number
          removed?: boolean
          selling_price_at_time?: number | null
          total_pieces?: number | null
          unit_cost?: number
          unit_price?: number
          unit_price_snapshot?: number
          units_per_case_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_taxes: {
        Row: {
          created_at: string
          id: string
          name: string
          order_id: string
          rate_percent: number | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_id: string
          rate_percent?: number | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_id?: string
          rate_percent?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_taxes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          created_by_role: string | null
          created_by_user_id: string | null
          created_source: string | null
          deleted_at: string | null
          distributor_id: string
          fulfilled_at: string | null
          id: string
          status: string
          vendor_id: string
          vendor_note: string | null
        }
        Insert: {
          created_at?: string
          created_by_role?: string | null
          created_by_user_id?: string | null
          created_source?: string | null
          deleted_at?: string | null
          distributor_id: string
          fulfilled_at?: string | null
          id?: string
          status?: string
          vendor_id: string
          vendor_note?: string | null
        }
        Update: {
          created_at?: string
          created_by_role?: string | null
          created_by_user_id?: string | null
          created_source?: string | null
          deleted_at?: string | null
          distributor_id?: string
          fulfilled_at?: string | null
          id?: string
          status?: string
          vendor_id?: string
          vendor_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_change_batches: {
        Row: {
          adjustment_type: string
          adjustment_value: number
          apply_mode: string | null
          change_type: string | null
          created_at: string
          created_by: string | null
          distributor_id: string
          field: string | null
          id: string
          reason: string | null
          scope: string
          scope_id: string | null
          value_applied: number | null
        }
        Insert: {
          adjustment_type: string
          adjustment_value: number
          apply_mode?: string | null
          change_type?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id: string
          field?: string | null
          id?: string
          reason?: string | null
          scope: string
          scope_id?: string | null
          value_applied?: number | null
        }
        Update: {
          adjustment_type?: string
          adjustment_value?: number
          apply_mode?: string | null
          change_type?: string | null
          created_at?: string
          created_by?: string | null
          distributor_id?: string
          field?: string | null
          id?: string
          reason?: string | null
          scope?: string
          scope_id?: string | null
          value_applied?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_change_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_change_batches_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_change_items: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          new_price_cents: number | null
          old_price_cents: number | null
          product_id: string
          product_name: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          new_price_cents?: number | null
          old_price_cents?: number | null
          product_id: string
          product_name?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          new_price_cents?: number | null
          old_price_cents?: number | null
          product_id?: string
          product_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_change_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "price_change_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_change_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_change_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          barcode: string
          created_at: string
          distributor_id: string
          id: string
          is_primary: boolean
          product_id: string
        }
        Insert: {
          barcode: string
          created_at?: string
          distributor_id: string
          id?: string
          is_primary?: boolean
          product_id: string
        }
        Update: {
          barcode?: string
          created_at?: string
          distributor_id?: string
          id?: string
          is_primary?: boolean
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          allow_case: boolean
          allow_piece: boolean
          barcode: string | null
          barcode_symbology: string | null
          category_id: string | null
          category_node_id: string | null
          cost_case: number | null
          cost_mode: string | null
          cost_per_case: number | null
          cost_per_unit: number | null
          cost_price: number
          created_at: string
          deleted_at: string | null
          deleted_reason: string | null
          distributor_id: string
          id: string
          is_active: boolean
          locked_stock_qty: number | null
          low_stock_threshold: number
          name: string
          price_case: number | null
          price_mode: string | null
          sell_per_case: number | null
          sell_per_unit: number | null
          sell_price: number
          sku: string | null
          stock_locked: boolean
          stock_mode: string | null
          stock_pieces: number | null
          stock_qty: number
          subcategory_id: string | null
          units_per_case: number | null
        }
        Insert: {
          active?: boolean
          allow_case?: boolean
          allow_piece?: boolean
          barcode?: string | null
          barcode_symbology?: string | null
          category_id?: string | null
          category_node_id?: string | null
          cost_case?: number | null
          cost_mode?: string | null
          cost_per_case?: number | null
          cost_per_unit?: number | null
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          distributor_id: string
          id?: string
          is_active?: boolean
          locked_stock_qty?: number | null
          low_stock_threshold?: number
          name: string
          price_case?: number | null
          price_mode?: string | null
          sell_per_case?: number | null
          sell_per_unit?: number | null
          sell_price?: number
          sku?: string | null
          stock_locked?: boolean
          stock_mode?: string | null
          stock_pieces?: number | null
          stock_qty?: number
          subcategory_id?: string | null
          units_per_case?: number | null
        }
        Update: {
          active?: boolean
          allow_case?: boolean
          allow_piece?: boolean
          barcode?: string | null
          barcode_symbology?: string | null
          category_id?: string | null
          category_node_id?: string | null
          cost_case?: number | null
          cost_mode?: string | null
          cost_per_case?: number | null
          cost_per_unit?: number | null
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          deleted_reason?: string | null
          distributor_id?: string
          id?: string
          is_active?: boolean
          locked_stock_qty?: number | null
          low_stock_threshold?: number
          name?: string
          price_case?: number | null
          price_mode?: string | null
          sell_per_case?: number | null
          sell_per_unit?: number | null
          sell_price?: number
          sku?: string | null
          stock_locked?: boolean
          stock_mode?: string | null
          stock_pieces?: number | null
          stock_qty?: number
          subcategory_id?: string | null
          units_per_case?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_node_id_fkey"
            columns: ["category_node_id"]
            isOneToOne: false
            referencedRelation: "category_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_distributor_id: string | null
          created_at: string
          display_name: string | null
          distributor_code: string | null
          distributor_code_id: string | null
          distributor_code_redeemed_at: string | null
          email: string | null
          id: string
          location_address: string | null
          notification_email: string | null
          phone: string | null
          role: string | null
          theme_preference: string | null
        }
        Insert: {
          active_distributor_id?: string | null
          created_at?: string
          display_name?: string | null
          distributor_code?: string | null
          distributor_code_id?: string | null
          distributor_code_redeemed_at?: string | null
          email?: string | null
          id: string
          location_address?: string | null
          notification_email?: string | null
          phone?: string | null
          role?: string | null
          theme_preference?: string | null
        }
        Update: {
          active_distributor_id?: string | null
          created_at?: string
          display_name?: string | null
          distributor_code?: string | null
          distributor_code_id?: string | null
          distributor_code_redeemed_at?: string | null
          email?: string | null
          id?: string
          location_address?: string | null
          notification_email?: string | null
          phone?: string | null
          role?: string | null
          theme_preference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_distributor_id_fkey"
            columns: ["active_distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_distributor_code_id_fkey"
            columns: ["distributor_code_id"]
            isOneToOne: false
            referencedRelation: "distributor_signup_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_center_resets: {
        Row: {
          created_at: string
          created_by: string
          distributor_id: string
          id: string
          note: string | null
          reset_at: string
          reset_from_date: string | null
          reset_to_date: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          distributor_id: string
          id?: string
          note?: string | null
          reset_at?: string
          reset_from_date?: string | null
          reset_to_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          distributor_id?: string
          id?: string
          note?: string | null
          reset_at?: string
          reset_from_date?: string | null
          reset_to_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profit_center_resets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_center_resets_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string | null
          deleted_at: string | null
          deleted_reason: string | null
          distributor_id: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          distributor_id: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          distributor_id?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_credit_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          distributor_id: string
          id: string
          invoice_id: string | null
          note: string | null
          order_id: string | null
          type: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          distributor_id: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          order_id?: string | null
          type: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          distributor_id?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          order_id?: string | null
          type?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_credit_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credit_ledger_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credit_ledger_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credit_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credit_ledger_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_draft_orders: {
        Row: {
          cart_payload: Json
          created_at: string
          currency: string
          distributor_id: string
          id: string
          name: string | null
          status: string
          subtotal_snapshot: number | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          cart_payload: Json
          created_at?: string
          currency?: string
          distributor_id: string
          id?: string
          name?: string | null
          status?: string
          subtotal_snapshot?: number | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          cart_payload?: Json
          created_at?: string
          currency?: string
          distributor_id?: string
          id?: string
          name?: string | null
          status?: string
          subtotal_snapshot?: number | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_draft_orders_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_draft_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_favorites_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_price_overrides: {
        Row: {
          created_at: string
          distributor_id: string
          id: string
          price_cents: number
          price_per_case: number | null
          price_per_unit: number | null
          product_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          distributor_id: string
          id?: string
          price_cents: number
          price_per_case?: number | null
          price_per_unit?: number | null
          product_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          distributor_id?: string
          id?: string
          price_cents?: number
          price_per_case?: number | null
          price_per_unit?: number | null
          product_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_price_overrides_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "low_stock_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_price_overrides_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_price_overrides_legacy_case_backfill_backup: {
        Row: {
          backed_up_at: string
          override_id: string
          price_cents: number | null
          price_per_case: number | null
          price_per_unit: number | null
        }
        Insert: {
          backed_up_at?: string
          override_id: string
          price_cents?: number | null
          price_per_case?: number | null
          price_per_unit?: number | null
        }
        Update: {
          backed_up_at?: string
          override_id?: string
          price_cents?: number | null
          price_per_case?: number | null
          price_per_unit?: number | null
        }
        Relationships: []
      }
      vendor_saved_distributor_codes: {
        Row: {
          created_at: string
          distributor_code: string
          distributor_name: string
          id: string
          last_used_at: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          distributor_code: string
          distributor_name: string
          id?: string
          last_used_at?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          distributor_code?: string
          distributor_name?: string
          id?: string
          last_used_at?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_saved_distributor_codes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      low_stock_products: {
        Row: {
          active: boolean | null
          allow_case: boolean | null
          allow_piece: boolean | null
          barcode: string | null
          barcode_symbology: string | null
          category_id: string | null
          category_node_id: string | null
          cost_case: number | null
          cost_mode: string | null
          cost_per_case: number | null
          cost_per_unit: number | null
          cost_price: number | null
          created_at: string | null
          deleted_at: string | null
          deleted_reason: string | null
          distributor_id: string | null
          id: string | null
          is_active: boolean | null
          locked_stock_qty: number | null
          low_stock_threshold: number | null
          name: string | null
          price_case: number | null
          price_mode: string | null
          sell_per_case: number | null
          sell_per_unit: number | null
          sell_price: number | null
          sku: string | null
          stock_locked: boolean | null
          stock_mode: string | null
          stock_pieces: number | null
          stock_qty: number | null
          subcategory_id: string | null
          units_per_case: number | null
        }
        Insert: {
          active?: boolean | null
          allow_case?: boolean | null
          allow_piece?: boolean | null
          barcode?: string | null
          barcode_symbology?: string | null
          category_id?: string | null
          category_node_id?: string | null
          cost_case?: number | null
          cost_mode?: string | null
          cost_per_case?: number | null
          cost_per_unit?: number | null
          cost_price?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          distributor_id?: string | null
          id?: string | null
          is_active?: boolean | null
          locked_stock_qty?: number | null
          low_stock_threshold?: number | null
          name?: string | null
          price_case?: number | null
          price_mode?: string | null
          sell_per_case?: number | null
          sell_per_unit?: number | null
          sell_price?: number | null
          sku?: string | null
          stock_locked?: boolean | null
          stock_mode?: string | null
          stock_pieces?: number | null
          stock_qty?: number | null
          subcategory_id?: string | null
          units_per_case?: number | null
        }
        Update: {
          active?: boolean | null
          allow_case?: boolean | null
          allow_piece?: boolean | null
          barcode?: string | null
          barcode_symbology?: string | null
          category_id?: string | null
          category_node_id?: string | null
          cost_case?: number | null
          cost_mode?: string | null
          cost_per_case?: number | null
          cost_per_unit?: number | null
          cost_price?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          distributor_id?: string | null
          id?: string | null
          is_active?: boolean | null
          locked_stock_qty?: number | null
          low_stock_threshold?: number | null
          name?: string | null
          price_case?: number | null
          price_mode?: string | null
          sell_per_case?: number | null
          sell_per_unit?: number | null
          sell_price?: number | null
          sku?: string | null
          stock_locked?: boolean | null
          stock_mode?: string | null
          stock_pieces?: number | null
          stock_qty?: number | null
          subcategory_id?: string | null
          units_per_case?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_node_id_fkey"
            columns: ["category_node_id"]
            isOneToOne: false
            referencedRelation: "category_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_vendor_credit: {
        Args: {
          p_amount: number
          p_distributor_id: string
          p_note?: string
          p_vendor_id: string
        }
        Returns: Json
      }
      apply_vendor_credit_to_order: {
        Args: {
          p_amount: number
          p_distributor_id: string
          p_note?: string
          p_order_id: string
          p_vendor_id: string
        }
        Returns: Json
      }
      archive_category_node: { Args: { p_node_id: string }; Returns: Json }
      bulk_adjust_prices:
        | {
            Args: {
              p_apply_mode: string
              p_change_type?: string
              p_distributor_id: string
              p_field?: string
              p_scope_id: string
              p_scope_type: string
              p_value?: number
              p_vendor_ids?: string[]
            }
            Returns: Json
          }
        | {
            Args: {
              p_apply_mode: string
              p_change_type?: string
              p_distributor_id: string
              p_field?: string
              p_price_unit?: string
              p_scope_id: string
              p_scope_type: string
              p_value?: number
              p_vendor_ids?: string[]
            }
            Returns: Json
          }
      bulk_adjust_prices_atomic: {
        Args: {
          p_apply_mode: string
          p_change_type?: string
          p_distributor_id: string
          p_field?: string
          p_price_unit?: string
          p_scope_id: string
          p_scope_type: string
          p_value?: number
          p_vendor_ids?: string[]
        }
        Returns: Json
      }
      deduct_vendor_credit: {
        Args: {
          p_amount: number
          p_distributor_id: string
          p_note?: string
          p_vendor_id: string
        }
        Returns: Json
      }
      enqueue_order_accepted_email_for_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      enqueue_order_placed_email_for_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      ensure_distributor_code: { Args: never; Returns: string }
      fulfill_order: { Args: { p_order_id: string }; Returns: undefined }
      generate_distributor_signup_code: {
        Args: { p_length?: number }
        Returns: string
      }
      generate_invoice: { Args: { p_order_id: string }; Returns: string }
      get_my_active_distributor_id: { Args: never; Returns: string }
      get_vendor_catalog_prices: {
        Args: { p_distributor_id: string }
        Returns: {
          allow_case: boolean
          allow_piece: boolean
          base_case_price: number
          base_unit_price: number
          category_id: string
          category_node_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          override_case_price: number
          override_unit_price: number
          sku: string
          stock_pieces: number
          stock_qty: number
          units_per_case: number
        }[]
      }
      get_vendor_purchase_insights: {
        Args: { p_distributor_id?: string; p_window_days?: number }
        Returns: {
          avg_order_value: number
          order_frequency_per_month: number
          order_frequency_per_week: number
          orders_count: number
          top_categories: Json
          total_spent: number
          window_days: number
        }[]
      }
      normalize_barcode: { Args: { input: string }; Returns: string }
      normalize_email_text: { Args: { p_email: string }; Returns: string }
      redeem_distributor_signup_code: {
        Args: {
          p_email?: string
          p_ip?: string
          p_signup_code: string
          p_user_agent?: string
        }
        Returns: Json
      }
      validate_distributor_signup_code: {
        Args: { p_signup_code: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
