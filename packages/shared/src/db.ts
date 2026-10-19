
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
            "ai_usage": {
                  Row: {
                    "cost_usd": number,"id": number,"input_tokens": number,"model": string,"output_tokens": number,"ts": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_usd": number,"id"?: never,"input_tokens": number,"model": string,"output_tokens": number,"ts"?: string,"user_id": string
                  }
                  Update: {
                    "cost_usd"?: number,"id"?: never,"input_tokens"?: number,"model"?: string,"output_tokens"?: number,"ts"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"calendar_events": {
                  Row: {
                    "all_day": boolean,"busy": boolean,"calendar_id": string,"end": string,"gcal_event_id": string,"start": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"busy"?: boolean,"calendar_id": string,"end": string,"gcal_event_id": string,"start": string,"title"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "all_day"?: boolean,"busy"?: boolean,"calendar_id"?: string,"end"?: string,"gcal_event_id"?: string,"start"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_events_user_id_calendar_id_fkey"
      columns: ["user_id","calendar_id"]
isOneToOne: false
      referencedRelation: "calendars"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"calendar_sync_state": {
                  Row: {
                    "calendar_id": string,"channel_expires_at": string | null,"channel_id": string | null,"channel_token": string | null,"last_synced_at": string | null,"resource_id": string | null,"sync_token": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calendar_id": string,"channel_expires_at"?: string | null,"channel_id"?: string | null,"channel_token"?: string | null,"last_synced_at"?: string | null,"resource_id"?: string | null,"sync_token"?: string | null,"user_id": string
                  }
                  Update: {
                    "calendar_id"?: string,"channel_expires_at"?: string | null,"channel_id"?: string | null,"channel_token"?: string | null,"last_synced_at"?: string | null,"resource_id"?: string | null,"sync_token"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_sync_state_user_id_calendar_id_fkey"
      columns: ["user_id","calendar_id"]
isOneToOne: true
      referencedRelation: "calendars"
      referencedColumns: ["user_id","id"]
    }
                  ]
                },"calendars": {
                  Row: {
                    "color": string | null,"id": string,"is_tasks_calendar": boolean,"selected": boolean,"summary": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"id": string,"is_tasks_calendar"?: boolean,"selected"?: boolean,"summary": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "color"?: string | null,"id"?: string,"is_tasks_calendar"?: boolean,"selected"?: boolean,"summary"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"google_accounts": {
                  Row: {
                    "created_at": string,"email": string,"needs_reconnect": boolean,"refresh_token_enc": string,"scopes": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"needs_reconnect"?: boolean,"refresh_token_enc": string,"scopes": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"needs_reconnect"?: boolean,"refresh_token_enc"?: string,"scopes"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"imports": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"kind": Database["public"]['Enums']["import_kind"],"list_id": string | null,"name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["import_kind"],"list_id"?: string | null,"name": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["import_kind"],"list_id"?: string | null,"name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "imports_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "lists"
      referencedColumns: ["id"]
    }
                  ]
                },"lists": {
                  Row: {
                    "color": string,"created_at": string,"deleted_at": string | null,"id": string,"name": string,"sort_order": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"name": string,"sort_order"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "created_at": string,"default_block_min": number,"timezone": string,"updated_at": string,"user_id": string,"working_hours": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_block_min"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"working_hours"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"default_block_min"?: number,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"working_hours"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"steps": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"done": boolean,"estimate_min": number | null,"id": string,"order": number,"task_id": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"done"?: boolean,"estimate_min"?: number | null,"id"?: string,"order"?: number,"task_id": string,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"done"?: boolean,"estimate_min"?: number | null,"id"?: string,"order"?: number,"task_id"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "steps_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "color": string | null,"created_at": string,"deleted_at": string | null,"due_at": string | null,"estimate_min": number | null,"id": string,"import_id": string | null,"list_id": string | null,"notes": string,"priority": Database["public"]['Enums']["priority"],"source_quote": string | null,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"due_at"?: string | null,"estimate_min"?: number | null,"id"?: string,"import_id"?: string | null,"list_id"?: string | null,"notes"?: string,"priority"?: Database["public"]['Enums']["priority"],"source_quote"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"due_at"?: string | null,"estimate_min"?: number | null,"id"?: string,"import_id"?: string | null,"list_id"?: string | null,"notes"?: string,"priority"?: Database["public"]['Enums']["priority"],"source_quote"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_import_id_fkey"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "lists"
      referencedColumns: ["id"]
    }
                  ]
                },"time_blocks": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"end": string,"gcal_event_id": string,"id": string,"start": string,"step_id": string | null,"task_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"end": string,"gcal_event_id": string,"id"?: string,"start": string,"step_id"?: string | null,"task_id": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"end"?: string,"gcal_event_id"?: string,"id"?: string,"start"?: string,"step_id"?: string | null,"task_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_blocks_step_id_fkey"
      columns: ["step_id"]
isOneToOne: false
      referencedRelation: "steps"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_blocks_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "commit_import":
{ Args: { "payload": Json }; Returns: Json
                           }
          }
          Enums: {
            "import_kind": "text"|"syllabus","priority": "none"|"low"|"med"|"high","task_status": "open"|"done"|"archived"
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
            "import_kind": ["text", "syllabus"],"priority": ["none", "low", "med", "high"],"task_status": ["open", "done", "archived"]
          }
        }
} as const
