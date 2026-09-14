/**
 * Row shapes for the tables in `supabase/schema.sql`.
 *
 * Hand-written rather than generated so the two stay reviewable side by side;
 * regenerate with `supabase gen types typescript` once the project exists and
 * replace this file wholesale.
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          locale: string
          created_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          locale?: string
        }
        Update: Partial<{ display_name: string | null; locale: string }>
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          owner_id: string | null
          draft_token: string | null
          main_goal: string
          language: string
          status: string
          is_public: boolean
          share_slug: string | null
          created_at: string
          updated_at: string
          expires_at: string | null
          step: string
          completed_at: string | null
          archived_at: string | null
          pinned: boolean
          last_activity_at: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          draft_token?: string | null
          main_goal: string
          language?: string
          status?: string
          expires_at?: string | null
        }
        Update: Partial<{
          main_goal: string
          language: string
          status: string
          is_public: boolean
          share_slug: string | null
          step: string
          completed_at: string | null
          archived_at: string | null
          pinned: boolean
          last_activity_at: string
        }>
        Relationships: []
      }
      subgoals: {
        Row: { id: string; plan_id: string; position: number; content: string; confirmed: boolean }
        Insert: { id?: string; plan_id: string; position: number; content: string; confirmed?: boolean }
        Update: Partial<{ position: number; content: string; confirmed: boolean }>
        Relationships: []
      }
      actions: {
        Row: {
          id: string
          plan_id: string
          subgoal_id: string
          position: number
          content: string
          metric: string | null
          cadence: string
          due_date: string | null
          progress: number
          updated_at: string
          confirmed: boolean
        }
        Insert: {
          id?: string
          plan_id: string
          subgoal_id: string
          position: number
          content: string
          metric?: string | null
          cadence?: string
          due_date?: string | null
          progress?: number
          confirmed?: boolean
        }
        Update: Partial<{
          content: string
          metric: string | null
          cadence: string
          due_date: string | null
          progress: number
          confirmed: boolean
        }>
        Relationships: []
      }
      action_dependencies: {
        Row: {
          plan_id: string
          action_id: string
          depends_on_id: string
          rationale: string | null
          confidence: number
          user_edited: boolean
        }
        Insert: {
          plan_id: string
          action_id: string
          depends_on_id: string
          rationale?: string | null
          confidence?: number
          user_edited?: boolean
        }
        Update: Partial<{ rationale: string | null; confidence: number; user_edited: boolean }>
        Relationships: []
      }
      progress_logs: {
        Row: {
          id: string
          plan_id: string
          action_id: string
          raw_text: string
          inferred_progress: number | null
          confirmed_progress: number
          confidence: number | null
          created_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          action_id: string
          raw_text: string
          inferred_progress?: number | null
          confirmed_progress: number
          confidence?: number | null
        }
        Update: never
        Relationships: []
      }
      anon_quota: {
        Row: { fingerprint: string; day: string; count: number }
        Insert: { fingerprint: string; day: string; count?: number }
        Update: Partial<{ count: number }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      claim_draft: {
        Args: { token: string; new_owner: string }
        Returns: string | null
      }
      purge_expired: { Args: Record<string, never>; Returns: undefined }
      save_plan_content: {
        /** `p_payload` is a PlanPayload from lib/plan-sync.ts. */
        Args: { p_plan_id: string; p_payload: unknown }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
