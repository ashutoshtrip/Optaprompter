export type Role = 'editor' | 'presenter' | 'viewer';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
}

export interface Script {
  id: string;
  title: string;
  room_id: string;
  owner_id: string;
  y_state: Uint8Array | null;
  created_at: string;
  updated_at: string;
}

export interface ScriptCollaborator {
  script_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

export interface AwarenessUser {
  name: string;
  color: string;
  userId: string;
}
