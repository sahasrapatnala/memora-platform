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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          file_id: string | null
          file_name: string | null
          id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          file_id?: string | null
          file_name?: string | null
          id?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          file_id?: string | null
          file_name?: string | null
          id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          created_at: string
          file_id: string | null
          id: string
          processing_job_id: string | null
          reason: string
          status: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          file_id?: string | null
          id?: string
          processing_job_id?: string | null
          reason: string
          status?: string
          user_id?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          file_id?: string | null
          id?: string
          processing_job_id?: string | null
          reason?: string
          status?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_processing_job_id_fkey"
            columns: ["processing_job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          content: string | null
          created_at: string
          document_id: string
          id: string
          page_number: number
          sha256: string | null
          size_bytes: number | null
          storage_path: string | null
          workspace_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          document_id: string
          id?: string
          page_number: number
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          workspace_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          document_id?: string
          id?: string
          page_number?: number
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_slides: {
        Row: {
          content: string | null
          created_at: string
          document_id: string
          id: string
          sha256: string | null
          size_bytes: number | null
          slide_number: number
          storage_path: string | null
          workspace_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          document_id: string
          id?: string
          sha256?: string | null
          size_bytes?: number | null
          slide_number: number
          storage_path?: string | null
          workspace_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          document_id?: string
          id?: string
          sha256?: string | null
          size_bytes?: number | null
          slide_number?: number
          storage_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_slides_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_slides_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          file_id: string
          id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_groups: {
        Row: {
          created_at: string
          id: string
          method: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          method: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          method?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_matches: {
        Row: {
          created_at: string
          file_id: string
          group_id: string
          id: string
          similarity: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          group_id: string
          id?: string
          similarity?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          group_id?: string
          id?: string
          similarity?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_matches_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "duplicate_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_matches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          format: string
          id: string
          name: string
          sha256: string | null
          size_bytes: number
          status: string
          storage_path: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          format: string
          id?: string
          name: string
          sha256?: string | null
          size_bytes: number
          status?: string
          storage_path: string
          user_id?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          name?: string
          sha256?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          content_sha256: string | null
          created_at: string
          file_id: string
          id: string
          processing_job_id: string | null
          source_key: string | null
          source_reference: Json
          workspace_id: string
        }
        Insert: {
          content: string
          content_sha256?: string | null
          created_at?: string
          file_id: string
          id?: string
          processing_job_id?: string | null
          source_key?: string | null
          source_reference?: Json
          workspace_id: string
        }
        Update: {
          content?: string
          content_sha256?: string | null
          created_at?: string
          file_id?: string
          id?: string
          processing_job_id?: string | null
          source_key?: string | null
          source_reference?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_processing_job_id_fkey"
            columns: ["processing_job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      offboarding_cases: {
        Row: {
          created_at: string
          id: string
          inventory_path: string | null
          name: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_path?: string | null
          name: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_path?: string | null
          name?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offboarding_cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      optimization_recommendations: {
        Row: {
          created_at: string
          file_id: string
          id: string
          reason: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          reason: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          reason?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimization_recommendations_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimization_recommendations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_artifacts: {
        Row: {
          created_at: string
          dispatch_token: string
          file_id: string
          id: string
          job_id: string
          kind: string
          sha256: string
          size_bytes: number
          storage_path: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          dispatch_token: string
          file_id: string
          id?: string
          job_id: string
          kind: string
          sha256: string
          size_bytes: number
          storage_path: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          dispatch_token?: string
          file_id?: string
          id?: string
          job_id?: string
          kind?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_artifacts_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_artifacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          created_at: string
          dispatch_actor_id: string | null
          dispatch_attempts: number
          dispatch_error: string | null
          dispatch_started_at: string | null
          dispatch_token: string | null
          dispatch_worker_id: string | null
          error: string | null
          file_id: string
          heartbeat_at: string | null
          id: string
          lease_expires_at: string | null
          progress: number | null
          stage: string
          status: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          dispatch_actor_id?: string | null
          dispatch_attempts?: number
          dispatch_error?: string | null
          dispatch_started_at?: string | null
          dispatch_token?: string | null
          dispatch_worker_id?: string | null
          error?: string | null
          file_id: string
          heartbeat_at?: string | null
          id?: string
          lease_expires_at?: string | null
          progress?: number | null
          stage?: string
          status?: string
          user_id?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          dispatch_actor_id?: string | null
          dispatch_attempts?: number
          dispatch_error?: string | null
          dispatch_started_at?: string | null
          dispatch_token?: string | null
          dispatch_worker_id?: string | null
          error?: string | null
          file_id?: string
          heartbeat_at?: string | null
          id?: string
          lease_expires_at?: string | null
          progress?: number | null
          stage?: string
          status?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_results: {
        Row: {
          completed_at: string
          created_at: string
          duration_seconds: number | null
          file_id: string
          job_id: string
          kind: string
          language: string | null
          manifest_sha256: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          completed_at: string
          created_at?: string
          duration_seconds?: number | null
          file_id: string
          job_id: string
          kind: string
          language?: string | null
          manifest_sha256: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          duration_seconds?: number | null
          file_id?: string
          job_id?: string
          kind?: string
          language?: string | null
          manifest_sha256?: string
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_results_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          storage_path: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          storage_path?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          storage_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      slide_intervals: {
        Row: {
          created_at: string
          end_seconds: number
          frame_id: string
          id: string
          start_seconds: number
          video_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          end_seconds: number
          frame_id: string
          id?: string
          start_seconds: number
          video_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          end_seconds?: number
          frame_id?: string
          id?: string
          start_seconds?: number
          video_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slide_intervals_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "video_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slide_intervals_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slide_intervals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      speaker_turns: {
        Row: {
          created_at: string
          end_seconds: number
          id: string
          speaker_id: string
          start_seconds: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          end_seconds: number
          id?: string
          speaker_id: string
          start_seconds: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          end_seconds?: number
          id?: string
          speaker_id?: string
          start_seconds?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaker_turns_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "video_speakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaker_turns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_analytics: {
        Row: {
          approval_id: string | null
          created_at: string
          file_id: string
          generated_size_bytes: number
          id: string
          package_verified_at: string | null
          reclaimed_size_bytes: number
          retention_verified_at: string | null
          workspace_id: string
        }
        Insert: {
          approval_id?: string | null
          created_at?: string
          file_id: string
          generated_size_bytes: number
          id?: string
          package_verified_at?: string | null
          reclaimed_size_bytes?: number
          retention_verified_at?: string | null
          workspace_id: string
        }
        Update: {
          approval_id?: string | null
          created_at?: string
          file_id?: string
          generated_size_bytes?: number
          id?: string
          package_verified_at?: string | null
          reclaimed_size_bytes?: number
          retention_verified_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_analytics_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_analytics_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_analytics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_segments: {
        Row: {
          content: string
          content_sha256: string | null
          created_at: string
          end_seconds: number
          id: string
          processing_job_id: string | null
          speaker_id: string | null
          start_seconds: number
          video_id: string
          workspace_id: string
        }
        Insert: {
          content: string
          content_sha256?: string | null
          created_at?: string
          end_seconds: number
          id?: string
          processing_job_id?: string | null
          speaker_id?: string | null
          start_seconds: number
          video_id: string
          workspace_id: string
        }
        Update: {
          content?: string
          content_sha256?: string | null
          created_at?: string
          end_seconds?: number
          id?: string
          processing_job_id?: string | null
          speaker_id?: string | null
          start_seconds?: number
          video_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_processing_job_id_fkey"
            columns: ["processing_job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_segments_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "video_speakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_segments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_segments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      video_frames: {
        Row: {
          created_at: string
          id: string
          processing_job_id: string | null
          sha256: string | null
          size_bytes: number
          storage_path: string
          thumbnail_path: string | null
          thumbnail_sha256: string | null
          thumbnail_size_bytes: number | null
          timestamp_seconds: number
          video_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          processing_job_id?: string | null
          sha256?: string | null
          size_bytes: number
          storage_path: string
          thumbnail_path?: string | null
          thumbnail_sha256?: string | null
          thumbnail_size_bytes?: number | null
          timestamp_seconds: number
          video_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          processing_job_id?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          thumbnail_path?: string | null
          thumbnail_sha256?: string | null
          thumbnail_size_bytes?: number | null
          timestamp_seconds?: number
          video_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_frames_processing_job_id_fkey"
            columns: ["processing_job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_frames_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_frames_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      video_speakers: {
        Row: {
          created_at: string
          id: string
          label: string
          video_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          video_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          video_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_speakers_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_speakers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string
          duration_seconds: number | null
          file_id: string
          id: string
          language: string | null
          processing_job_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          file_id: string
          id?: string
          language?: string | null
          processing_job_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          file_id?: string
          id?: string
          language?: string | null
          processing_job_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: true
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_processing_job_id_fkey"
            columns: ["processing_job_id"]
            isOneToOne: false
            referencedRelation: "processing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assert_processing_attempt: {
        Args: {
          p_job: string
          p_token: string
          p_worker_id: string
          p_workspace: string
        }
        Returns: {
          created_at: string
          dispatch_actor_id: string | null
          dispatch_attempts: number
          dispatch_error: string | null
          dispatch_started_at: string | null
          dispatch_token: string | null
          dispatch_worker_id: string | null
          error: string | null
          file_id: string
          heartbeat_at: string | null
          id: string
          lease_expires_at: string | null
          progress: number | null
          stage: string
          status: string
          user_id: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "processing_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_processing_attempt: {
        Args: { p_actor: string; p_job: string; p_workspace: string }
        Returns: string
      }
      claim_approved_processing_job: {
        Args: {
          p_actor: string
          p_job: string
          p_lease_seconds?: number
          p_worker_id: string
          p_workspace: string
        }
        Returns: {
          dispatch_attempts: number
          dispatch_token: string
          file_format: string
          file_id: string
          file_name: string
          file_owner_id: string
          file_sha256: string
          file_size_bytes: number
          file_storage_path: string
          job_id: string
          lease_expires_at: string
          outcome: string
          workspace_id: string
        }[]
      }
      create_workspace: { Args: { workspace_name: string }; Returns: string }
      decide_processing_job: {
        Args: {
          p_decision: string
          p_job: string
          p_reason: string
          p_workspace: string
        }
        Returns: {
          decision_id: string
          job_id: string
          job_status: string
          reused: boolean
        }[]
      }
      expire_processing_attempt: {
        Args: { p_job: string; p_workspace: string }
        Returns: string
      }
      fail_processing_attempt: {
        Args: {
          p_error_code: string
          p_job: string
          p_token: string
          p_worker_id: string
          p_workspace: string
        }
        Returns: string
      }
      finalize_processing_attempt: {
        Args: {
          p_job: string
          p_manifest: Json
          p_manifest_sha256: string
          p_token: string
          p_worker_id: string
          p_workspace: string
        }
        Returns: string
      }
      heartbeat_processing_job: {
        Args: {
          p_job: string
          p_lease_seconds?: number
          p_token: string
          p_worker_id: string
          p_workspace: string
        }
        Returns: string
      }
      is_workspace_member: { Args: { w: string }; Returns: boolean }
      progress_processing_attempt: {
        Args: {
          p_job: string
          p_lease_seconds?: number
          p_progress: number
          p_stage: string
          p_token: string
          p_worker_id: string
          p_workspace: string
        }
        Returns: string
      }
      register_processing_artifact: {
        Args: {
          p_job: string
          p_kind: string
          p_path: string
          p_sha256: string
          p_size: number
          p_token: string
          p_worker_id: string
          p_workspace: string
        }
        Returns: string
      }
      register_verified_original: {
        Args: {
          p_format: string
          p_hash: string
          p_name: string
          p_path: string
          p_size: number
          p_user: string
          p_workspace: string
        }
        Returns: string
      }
      set_original_deletion: {
        Args: { p_file: string; p_state: string; p_user: string }
        Returns: undefined
      }
      validate_video_demo_manifest: {
        Args: {
          p: Json
          p_format: string
          p_hash: string
          p_job: string
          p_token: string
          p_worker: string
          p_workspace: string
        }
        Returns: undefined
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
    Enums: {},
  },
} as const
