
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "addon_groups": {
                  Row: {
                    "id": string,"item_id": string,"max_select": number,"min_select": number,"name": string,"sort_order": number
                  }
                  Insert: {
                    "id"?: string,"item_id": string,"max_select"?: number,"min_select"?: number,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "id"?: string,"item_id"?: string,"max_select"?: number,"min_select"?: number,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "addon_groups_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "addon_groups_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "v_dish_sales"
      referencedColumns: ["item_id"]
    }
                  ]
                },"addons": {
                  Row: {
                    "group_id": string,"id": string,"is_active": boolean,"name": string,"price": number
                  }
                  Insert: {
                    "group_id": string,"id"?: string,"is_active"?: boolean,"name": string,"price"?: number
                  }
                  Update: {
                    "group_id"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "addons_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "addon_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance": {
                  Row: {
                    "clock_in": string,"clock_out": string | null,"id": string,"outlet_id": string,"user_id": string
                  }
                  Insert: {
                    "clock_in"?: string,"clock_out"?: string | null,"id"?: string,"outlet_id": string,"user_id": string
                  }
                  Update: {
                    "clock_in"?: string,"clock_out"?: string | null,"id"?: string,"outlet_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"before": Json | null,"created_at": string,"entity": string,"entity_id": string,"id": string,"outlet_id": string
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"entity": string,"entity_id": string,"id"?: string,"outlet_id": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"entity"?: string,"entity_id"?: string,"id"?: string,"outlet_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"bill_counters": {
                  Row: {
                    "financial_year": string,"next_number": number,"outlet_id": string
                  }
                  Insert: {
                    "financial_year": string,"next_number"?: number,"outlet_id": string
                  }
                  Update: {
                    "financial_year"?: string,"next_number"?: number,"outlet_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_counters_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"bills": {
                  Row: {
                    "bill_no": string | null,"created_at": string,"customer_id": string | null,"discount": number,"discount_by": string | null,"discount_reason": string | null,"id": string,"outlet_id": string,"round_off": number,"service_charge": number,"session_id": string,"status": Database["public"]['Enums']["bill_status"],"subtotal": number,"tax_total": number,"total": number,"updated_at": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  Insert: {
                    "bill_no"?: string | null,"created_at"?: string,"customer_id"?: string | null,"discount"?: number,"discount_by"?: string | null,"discount_reason"?: string | null,"id"?: string,"outlet_id": string,"round_off"?: number,"service_charge"?: number,"session_id": string,"status"?: Database["public"]['Enums']["bill_status"],"subtotal"?: number,"tax_total"?: number,"total"?: number,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "bill_no"?: string | null,"created_at"?: string,"customer_id"?: string | null,"discount"?: number,"discount_by"?: string | null,"discount_reason"?: string | null,"id"?: string,"outlet_id"?: string,"round_off"?: number,"service_charge"?: number,"session_id"?: string,"status"?: Database["public"]['Enums']["bill_status"],"subtotal"?: number,"tax_total"?: number,"total"?: number,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bills_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_discount_by_fkey"
      columns: ["discount_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "created_at": string,"customer_id": string | null,"id": string,"name": string,"notes": string | null,"outlet_id": string,"party_size": number,"phone": string,"source": Database["public"]['Enums']["booking_source"],"starts_at": string,"status": Database["public"]['Enums']["booking_status"],"table_ids": (string)[],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"customer_id"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"outlet_id": string,"party_size"?: number,"phone": string,"source"?: Database["public"]['Enums']["booking_source"],"starts_at": string,"status"?: Database["public"]['Enums']["booking_status"],"table_ids"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"outlet_id"?: string,"party_size"?: number,"phone"?: string,"source"?: Database["public"]['Enums']["booking_source"],"starts_at"?: string,"status"?: Database["public"]['Enums']["booking_status"],"table_ids"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "available_from": string | null,"available_to": string | null,"created_at": string,"description": string | null,"id": string,"image_url": string | null,"is_active": boolean,"name": string,"outlet_id": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "available_from"?: string | null,"available_to"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"name": string,"outlet_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "available_from"?: string | null,"available_to"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"name"?: string,"outlet_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "created_at": string,"id": string,"name": string | null,"outlet_id": string,"phone": string,"total_spend": number,"updated_at": string,"visits": number,"whatsapp_opt_in": boolean
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name"?: string | null,"outlet_id": string,"phone": string,"total_spend"?: number,"updated_at"?: string,"visits"?: number,"whatsapp_opt_in"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string | null,"outlet_id"?: string,"phone"?: string,"total_spend"?: number,"updated_at"?: string,"visits"?: number,"whatsapp_opt_in"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_sales_summary": {
                  Row: {
                    "amount": number,"category_id": string | null,"date": string,"item_id": string,"outlet_id": string,"qty": number,"table_id": string,"waiter_id": string
                  }
                  Insert: {
                    "amount"?: number,"category_id"?: string | null,"date": string,"item_id": string,"outlet_id": string,"qty"?: number,"table_id": string,"waiter_id": string
                  }
                  Update: {
                    "amount"?: number,"category_id"?: string | null,"date"?: string,"item_id"?: string,"outlet_id"?: string,"qty"?: number,"table_id"?: string,"waiter_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_sales_summary_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_sales_summary_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_sales_summary_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "v_dish_sales"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "daily_sales_summary_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_sales_summary_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_sales_summary_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "v_table_sales"
      referencedColumns: ["table_id"]
    },{
      foreignKeyName: "daily_sales_summary_waiter_id_fkey"
      columns: ["waiter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"devices": {
                  Row: {
                    "created_at": string,"device_identifier": string,"fcm_token": string | null,"id": string,"last_seen": string | null,"outlet_id": string,"platform": Database["public"]['Enums']["device_platform"],"revoked_at": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"device_identifier": string,"fcm_token"?: string | null,"id"?: string,"last_seen"?: string | null,"outlet_id": string,"platform": Database["public"]['Enums']["device_platform"],"revoked_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"device_identifier"?: string,"fcm_token"?: string | null,"id"?: string,"last_seen"?: string | null,"outlet_id"?: string,"platform"?: Database["public"]['Enums']["device_platform"],"revoked_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "devices_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devices_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"floors": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"outlet_id": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"outlet_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"outlet_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "floors_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"item_variants": {
                  Row: {
                    "id": string,"is_active": boolean,"item_id": string,"name": string,"price": number,"sort_order": number
                  }
                  Insert: {
                    "id"?: string,"is_active"?: boolean,"item_id": string,"name": string,"price": number,"sort_order"?: number
                  }
                  Update: {
                    "id"?: string,"is_active"?: boolean,"item_id"?: string,"name"?: string,"price"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_variants_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_variants_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "v_dish_sales"
      referencedColumns: ["item_id"]
    }
                  ]
                },"menu_items": {
                  Row: {
                    "allergens": (string)[],"category_id": string,"created_at": string,"description": string | null,"food_type": Database["public"]['Enums']["food_type"],"id": string,"image_urls": (string)[],"in_stock": boolean,"is_active": boolean,"name": string,"outlet_id": string,"prep_minutes": number,"price": number,"sort_order": number,"spice_level": number | null,"station": string | null,"tags": (string)[],"tax_group_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "allergens"?: (string)[],"category_id": string,"created_at"?: string,"description"?: string | null,"food_type"?: Database["public"]['Enums']["food_type"],"id"?: string,"image_urls"?: (string)[],"in_stock"?: boolean,"is_active"?: boolean,"name": string,"outlet_id": string,"prep_minutes"?: number,"price": number,"sort_order"?: number,"spice_level"?: number | null,"station"?: string | null,"tags"?: (string)[],"tax_group_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "allergens"?: (string)[],"category_id"?: string,"created_at"?: string,"description"?: string | null,"food_type"?: Database["public"]['Enums']["food_type"],"id"?: string,"image_urls"?: (string)[],"in_stock"?: boolean,"is_active"?: boolean,"name"?: string,"outlet_id"?: string,"prep_minutes"?: number,"price"?: number,"sort_order"?: number,"spice_level"?: number | null,"station"?: string | null,"tags"?: (string)[],"tax_group_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_items_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "menu_items_tax_group_id_fkey"
      columns: ["tax_group_id"]
isOneToOne: false
      referencedRelation: "tax_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "acknowledged_at": string | null,"acknowledged_by": string | null,"created_at": string,"event": Database["public"]['Enums']["notification_event"],"id": string,"outlet_id": string,"payload": NonNullable<Json>,"session_id": string | null,"table_id": string | null,"target_user_id": string | null
                  }
                  Insert: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"created_at"?: string,"event": Database["public"]['Enums']["notification_event"],"id"?: string,"outlet_id": string,"payload"?: NonNullable<Json>,"session_id"?: string | null,"table_id"?: string | null,"target_user_id"?: string | null
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"created_at"?: string,"event"?: Database["public"]['Enums']["notification_event"],"id"?: string,"outlet_id"?: string,"payload"?: NonNullable<Json>,"session_id"?: string | null,"table_id"?: string | null,"target_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_acknowledged_by_fkey"
      columns: ["acknowledged_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "v_table_sales"
      referencedColumns: ["table_id"]
    },{
      foreignKeyName: "notifications_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"order_events": {
                  Row: {
                    "actor_id": string | null,"at": string,"from_status": string | null,"id": string,"order_id": string | null,"order_item_id": string | null,"outlet_id": string,"to_status": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"at"?: string,"from_status"?: string | null,"id"?: string,"order_id"?: string | null,"order_item_id"?: string | null,"outlet_id": string,"to_status": string
                  }
                  Update: {
                    "actor_id"?: string | null,"at"?: string,"from_status"?: string | null,"id"?: string,"order_id"?: string | null,"order_item_id"?: string | null,"outlet_id"?: string,"to_status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"order_item_addons": {
                  Row: {
                    "addon_id": string,"id": string,"order_item_id": string,"price": number
                  }
                  Insert: {
                    "addon_id": string,"id"?: string,"order_item_id": string,"price"?: number
                  }
                  Update: {
                    "addon_id"?: string,"id"?: string,"order_item_id"?: string,"price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_item_addons_addon_id_fkey"
      columns: ["addon_id"]
isOneToOne: false
      referencedRelation: "addons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_item_addons_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"cooked_at": string | null,"created_at": string,"id": string,"item_id": string,"notes": string | null,"order_id": string,"outlet_id": string,"qty": number,"ready_at": string | null,"served_at": string | null,"station": string | null,"status": Database["public"]['Enums']["order_item_status"],"unit_price": number,"updated_at": string,"variant_id": string | null
                  }
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cooked_at"?: string | null,"created_at"?: string,"id"?: string,"item_id": string,"notes"?: string | null,"order_id": string,"outlet_id": string,"qty"?: number,"ready_at"?: string | null,"served_at"?: string | null,"station"?: string | null,"status"?: Database["public"]['Enums']["order_item_status"],"unit_price": number,"updated_at"?: string,"variant_id"?: string | null
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"cooked_at"?: string | null,"created_at"?: string,"id"?: string,"item_id"?: string,"notes"?: string | null,"order_id"?: string,"outlet_id"?: string,"qty"?: number,"ready_at"?: string | null,"served_at"?: string | null,"station"?: string | null,"status"?: Database["public"]['Enums']["order_item_status"],"unit_price"?: number,"updated_at"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "v_dish_sales"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "item_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "created_at": string,"id": string,"kot_number": number,"outlet_id": string,"placed_by": string | null,"session_id": string,"source": Database["public"]['Enums']["order_source"],"status": Database["public"]['Enums']["order_status"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"kot_number": number,"outlet_id": string,"placed_by"?: string | null,"session_id": string,"source": Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kot_number"?: number,"outlet_id"?: string,"placed_by"?: string | null,"session_id"?: string,"source"?: Database["public"]['Enums']["order_source"],"status"?: Database["public"]['Enums']["order_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_placed_by_fkey"
      columns: ["placed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"outlets": {
                  Row: {
                    "address": string | null,"created_at": string,"fssai": string | null,"gstin": string | null,"id": string,"is_active": boolean,"logo_url": string | null,"name": string,"settings": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"fssai"?: string | null,"gstin"?: string | null,"id"?: string,"is_active"?: boolean,"logo_url"?: string | null,"name": string,"settings"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"fssai"?: string | null,"gstin"?: string | null,"id"?: string,"is_active"?: boolean,"logo_url"?: string | null,"name"?: string,"settings"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"bill_id": string,"created_at": string,"gateway_payment_id": string | null,"id": string,"marked_by": string | null,"mode": Database["public"]['Enums']["payment_mode"],"outlet_id": string,"reference": string | null,"status": Database["public"]['Enums']["payment_status"]
                  }
                  Insert: {
                    "amount": number,"bill_id": string,"created_at"?: string,"gateway_payment_id"?: string | null,"id"?: string,"marked_by"?: string | null,"mode": Database["public"]['Enums']["payment_mode"],"outlet_id": string,"reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Update: {
                    "amount"?: number,"bill_id"?: string,"created_at"?: string,"gateway_payment_id"?: string | null,"id"?: string,"marked_by"?: string | null,"mode"?: Database["public"]['Enums']["payment_mode"],"outlet_id"?: string,"reference"?: string | null,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_bill_id_fkey"
      columns: ["bill_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_marked_by_fkey"
      columns: ["marked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "assigned_areas": (string)[],"created_at": string,"id": string,"is_active": boolean,"joining_date": string,"name": string,"outlet_id": string,"phone": string,"photo_url": string | null,"pin_hash": string,"role_id": string,"updated_at": string
                  }
                  Insert: {
                    "assigned_areas"?: (string)[],"created_at"?: string,"id": string,"is_active"?: boolean,"joining_date"?: string,"name": string,"outlet_id": string,"phone": string,"photo_url"?: string | null,"pin_hash": string,"role_id": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_areas"?: (string)[],"created_at"?: string,"id"?: string,"is_active"?: boolean,"joining_date"?: string,"name"?: string,"outlet_id"?: string,"phone"?: string,"photo_url"?: string | null,"pin_hash"?: string,"role_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission": Database["public"]['Enums']["permission_key"],"role_id": string
                  }
                  Insert: {
                    "permission": Database["public"]['Enums']["permission_key"],"role_id": string
                  }
                  Update: {
                    "permission"?: Database["public"]['Enums']["permission_key"],"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"id": string,"is_system": boolean,"max_discount_percent": number | null,"name": Database["public"]['Enums']["app_role"],"outlet_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_system"?: boolean,"max_discount_percent"?: number | null,"name": Database["public"]['Enums']["app_role"],"outlet_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_system"?: boolean,"max_discount_percent"?: number | null,"name"?: Database["public"]['Enums']["app_role"],"outlet_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"table_session_customers": {
                  Row: {
                    "customer_auth_id": string,"joined_at": string,"name": string | null,"phone": string | null,"session_id": string
                  }
                  Insert: {
                    "customer_auth_id": string,"joined_at"?: string,"name"?: string | null,"phone"?: string | null,"session_id": string
                  }
                  Update: {
                    "customer_auth_id"?: string,"joined_at"?: string,"name"?: string | null,"phone"?: string | null,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "table_session_customers_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"table_sessions": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"guest_count": number | null,"id": string,"opened_at": string,"outlet_id": string,"requires_order_confirmation": boolean,"status": Database["public"]['Enums']["table_session_status"],"table_id": string,"updated_at": string,"waiter_id": string | null
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"guest_count"?: number | null,"id"?: string,"opened_at"?: string,"outlet_id": string,"requires_order_confirmation"?: boolean,"status"?: Database["public"]['Enums']["table_session_status"],"table_id": string,"updated_at"?: string,"waiter_id"?: string | null
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"guest_count"?: number | null,"id"?: string,"opened_at"?: string,"outlet_id"?: string,"requires_order_confirmation"?: boolean,"status"?: Database["public"]['Enums']["table_session_status"],"table_id"?: string,"updated_at"?: string,"waiter_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "table_sessions_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "table_sessions_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "tables"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "table_sessions_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "v_table_sales"
      referencedColumns: ["table_id"]
    },{
      foreignKeyName: "table_sessions_waiter_id_fkey"
      columns: ["waiter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tables": {
                  Row: {
                    "capacity": number,"created_at": string,"default_waiter_id": string | null,"floor_id": string,"id": string,"is_active": boolean,"name": string,"ordering_override": Json | null,"outlet_id": string,"pos_x": number | null,"pos_y": number | null,"qr_token": string,"shape": string,"status": Database["public"]['Enums']["table_status"],"updated_at": string
                  }
                  Insert: {
                    "capacity"?: number,"created_at"?: string,"default_waiter_id"?: string | null,"floor_id": string,"id"?: string,"is_active"?: boolean,"name": string,"ordering_override"?: Json | null,"outlet_id": string,"pos_x"?: number | null,"pos_y"?: number | null,"qr_token": string,"shape"?: string,"status"?: Database["public"]['Enums']["table_status"],"updated_at"?: string
                  }
                  Update: {
                    "capacity"?: number,"created_at"?: string,"default_waiter_id"?: string | null,"floor_id"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"ordering_override"?: Json | null,"outlet_id"?: string,"pos_x"?: number | null,"pos_y"?: number | null,"qr_token"?: string,"shape"?: string,"status"?: Database["public"]['Enums']["table_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_default_waiter_id_fkey"
      columns: ["default_waiter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tables_floor_id_fkey"
      columns: ["floor_id"]
isOneToOne: false
      referencedRelation: "floors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tables_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"tax_groups": {
                  Row: {
                    "cgst_percent": number,"created_at": string,"id": string,"is_active": boolean,"name": string,"outlet_id": string,"sgst_percent": number,"updated_at": string
                  }
                  Insert: {
                    "cgst_percent"?: number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"outlet_id": string,"sgst_percent"?: number,"updated_at"?: string
                  }
                  Update: {
                    "cgst_percent"?: number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"outlet_id"?: string,"sgst_percent"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tax_groups_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"whatsapp_messages": {
                  Row: {
                    "bill_id": string,"created_at": string,"error": string | null,"id": string,"outlet_id": string,"phone": string,"status": Database["public"]['Enums']["whatsapp_status"],"template": string,"updated_at": string,"wa_message_id": string | null
                  }
                  Insert: {
                    "bill_id": string,"created_at"?: string,"error"?: string | null,"id"?: string,"outlet_id": string,"phone": string,"status"?: Database["public"]['Enums']["whatsapp_status"],"template": string,"updated_at"?: string,"wa_message_id"?: string | null
                  }
                  Update: {
                    "bill_id"?: string,"created_at"?: string,"error"?: string | null,"id"?: string,"outlet_id"?: string,"phone"?: string,"status"?: Database["public"]['Enums']["whatsapp_status"],"template"?: string,"updated_at"?: string,"wa_message_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "whatsapp_messages_bill_id_fkey"
      columns: ["bill_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "whatsapp_messages_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_dish_sales": {
                  Row: {
                    "cancellations": number | null,"category_id": string | null,"item_id": string | null,"name": string | null,"outlet_id": string | null,"qty_sold": number | null,"revenue": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                },"v_table_sales": {
                  Row: {
                    "avg_turnaround_minutes": number | null,"bills": number | null,"outlet_id": string | null,"revenue": number | null,"table_id": string | null,"table_name": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bills_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_payment":
{ Args: { "p_amount": number,"p_bill_id": string,"p_mode": Database["public"]['Enums']["payment_mode"],"p_reference"?: string }; Returns: Json
                           },
"allocate_bill_number":
{ Args: { "p_outlet_id": string }; Returns: string
                           },
"apply_discount":
{ Args: { "p_bill_id": string,"p_discount": number,"p_reason"?: string }; Returns: Json
                           },
"apply_item_status":
{ Args: { "p_actor": string,"p_item_ids": (string)[],"p_status": Database["public"]['Enums']["order_item_status"] }; Returns: undefined
                           },
"assign_waiter":
{ Args: { "p_table_id": string,"p_waiter_id": string }; Returns: Json
                           },
"auth_outlet_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"auth_profile_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"auth_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"call_waiter":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"cancel_item":
{ Args: { "p_item_id": string,"p_reason"?: string }; Returns: undefined
                           },
"claim_table":
{ Args: { "p_table_id": string }; Returns: Json
                           },
"compute_bill_totals":
{ Args: { "p_discount"?: number,"p_session_id": string }; Returns: {
              "round_off": number,"service_charge": number,"subtotal": number,"tax_total": number,"total": number
            }[]
                           },
"create_bill":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"create_notification_for_order":
{ Args: { "p_event": Database["public"]['Enums']["notification_event"],"p_order_id": string }; Returns: undefined
                           },
"custom_access_token_hook":
{ Args: { "event": Json }; Returns: Json
                           },
"customer_outlet_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"customer_session_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"fill_daily_sales_summary":
{ Args: { "p_date"?: string }; Returns: undefined
                           },
"financial_year_label":
{ Args: { "p_date"?: string }; Returns: string
                           },
"has_permission":
{ Args: { "p_permission": Database["public"]['Enums']["permission_key"] }; Returns: boolean
                           },
"hash_pin":
{ Args: { "p_pin": string }; Returns: string
                           },
"is_customer":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: { "p_outlet_id": string }; Returns: boolean
                           },
"mark_paid":
{ Args: { "p_bill_id": string }; Returns: Json
                           },
"place_order":
{ Args: { "p_items": Json,"p_session_id": string }; Returns: Json
                           },
"provision_default_roles":
{ Args: { "p_outlet_id": string }; Returns: undefined
                           },
"provision_outlet":
{ Args: { "p_name": string,"p_settings"?: Json }; Returns: string
                           },
"recompute_order_status":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"report_sales":
{ Args: { "p_from": string,"p_group_by"?: string,"p_to": string }; Returns: Json
                           },
"request_bill":
{ Args: { "p_session_id": string }; Returns: undefined
                           },
"resolve_qr":
{ Args: { "p_token": string }; Returns: Json
                           },
"set_item_status":
{ Args: { "p_item_ids": (string)[],"p_status": Database["public"]['Enums']["order_item_status"] }; Returns: undefined
                           },
"set_order_status":
{ Args: { "p_order_id": string,"p_status": Database["public"]['Enums']["order_status"] }; Returns: undefined
                           },
"test_login_as":
{ Args: { "p_phone": string }; Returns: undefined
                           },
"test_login_as_new_customer":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"transfer_table":
{ Args: { "p_table_id": string,"p_to_waiter_id"?: string }; Returns: Json
                           },
"verify_pin":
{ Args: { "p_hash": string,"p_pin": string }; Returns: boolean
                           },
"void_bill":
{ Args: { "p_bill_id": string,"p_reason": string }; Returns: Json
                           }
          }
          Enums: {
            "app_role": "super_admin"|"manager"|"cashier"|"waiter"|"kitchen","bill_status": "open"|"paid"|"void","booking_source": "phone"|"walk_in"|"website","booking_status": "booked"|"arrived"|"no_show"|"cancelled","device_platform": "android_waiter"|"android_kitchen"|"web_admin","food_type": "veg"|"non_veg"|"egg","notification_event": "order_ready"|"call_waiter"|"bill_requested"|"new_unassigned_table"|"item_cancelled"|"order_waiting_too_long"|"whatsapp_failed"|"booking_arriving","order_item_status": "ordered"|"cooking"|"ready"|"served"|"cancelled","order_source": "customer"|"waiter"|"admin","order_status": "placed"|"cooking"|"ready"|"served"|"cancelled","payment_mode": "cash"|"upi"|"card"|"online"|"other","payment_status": "pending"|"confirmed"|"failed"|"refunded","permission_key": "menu_manage"|"tables_manage"|"ordering_settings_manage"|"orders_place"|"orders_cancel_after_cooking"|"item_status_update"|"discount_apply"|"bill_mark_paid"|"reports_view_all"|"reports_view_own"|"employee_manage"|"employee_view"|"settings_manage","table_session_status": "open"|"closed","table_status": "free"|"occupied"|"bill_requested"|"paid"|"cleaning"|"reserved","whatsapp_status": "queued"|"sent"|"delivered"|"read"|"failed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["super_admin", "manager", "cashier", "waiter", "kitchen"],"bill_status": ["open", "paid", "void"],"booking_source": ["phone", "walk_in", "website"],"booking_status": ["booked", "arrived", "no_show", "cancelled"],"device_platform": ["android_waiter", "android_kitchen", "web_admin"],"food_type": ["veg", "non_veg", "egg"],"notification_event": ["order_ready", "call_waiter", "bill_requested", "new_unassigned_table", "item_cancelled", "order_waiting_too_long", "whatsapp_failed", "booking_arriving"],"order_item_status": ["ordered", "cooking", "ready", "served", "cancelled"],"order_source": ["customer", "waiter", "admin"],"order_status": ["placed", "cooking", "ready", "served", "cancelled"],"payment_mode": ["cash", "upi", "card", "online", "other"],"payment_status": ["pending", "confirmed", "failed", "refunded"],"permission_key": ["menu_manage", "tables_manage", "ordering_settings_manage", "orders_place", "orders_cancel_after_cooking", "item_status_update", "discount_apply", "bill_mark_paid", "reports_view_all", "reports_view_own", "employee_manage", "employee_view", "settings_manage"],"table_session_status": ["open", "closed"],"table_status": ["free", "occupied", "bill_requested", "paid", "cleaning", "reserved"],"whatsapp_status": ["queued", "sent", "delivered", "read", "failed"]
          }
        }
} as const

