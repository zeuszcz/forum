export interface Role {
  slug: string;
  title: string;
  color: string;
  is_staff: boolean;
}

export interface UserPublic {
  id: number;
  nickname: string;
  avatar_url: string | null;
  title: string | null;
  bio: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  roles: Role[];
  total_posts: number;
  total_reactions_received: number;
}

export interface Section {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  accent: "plasma" | "flame" | "cyan" | "ember";
  display_order: number;
  is_locked: boolean;
  thread_count: number;
  post_count: number;
  last_thread_id: number | null;
}

export interface Thread {
  id: number;
  section_id: number;
  title: string;
  slug: string;
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  last_post_at: string | null;
  created_at: string;
  author: UserPublic | null;
  last_post_author: UserPublic | null;
}

export interface Post {
  id: number;
  thread_id: number;
  body: string;
  is_first: boolean;
  parent_post_id: number | null;
  edited_at: string | null;
  created_at: string;
  author: UserPublic | null;
  reaction_count: number;
  has_reacted: boolean;
}

export interface ThreadWithPosts {
  thread: Thread;
  posts: Post[];
  section: Section;
  total_posts: number;
}

export interface ShoutboxMessage {
  id: number;
  body: string;
  created_at: string;
  author: UserPublic | null;
}

export interface AuthResponse {
  user: UserPublic;
  access_token: string;
  token_type: string;
}

export interface SectionThreadsResponse {
  section: Section;
  threads: Thread[];
  total: number;
  limit: number;
  offset: number;
}

export interface SparklineData {
  slug: string;
  values: number[];
}

export interface ActivityBucket {
  hour: string;
  posts: number;
  threads: number;
}

export interface ActivityResponse {
  buckets: ActivityBucket[];
  hours: number;
}

export interface TopUser {
  id: number;
  rank: number;
  nickname: string;
  avatar_url: string | null;
  title: string | null;
  posts: number;
  reactions: number;
  score: number;
}

// ===== Admin =====

export interface AdminUserRead {
  id: number;
  nickname: string;
  email: string | null;
  avatar_url: string | null;
  title: string | null;
  is_active: boolean;
  is_verified: boolean;
  last_seen_at: string | null;
  created_at: string;
  is_banned: boolean;
  ban_reason: string | null;
  banned_until: string | null;
  is_muted: boolean;
  mute_reason: string | null;
  muted_until: string | null;
  can_create_threads: boolean;
  roles: Role[];
}

export interface AdminUsersResponse {
  users: AdminUserRead[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminStats {
  users_total: number;
  users_banned: number;
  users_muted: number;
  threads_total: number;
  posts_total: number;
  sections_locked: number;
}

export interface ModerationLogRead {
  id: number;
  action: string;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  actor_id: number | null;
  target_user_id: number | null;
  target_post_id: number | null;
  target_thread_id: number | null;
  target_section_id: number | null;
}

export interface RoleAdminRead {
  id: number;
  slug: string;
  title: string;
  color: string;
  display_order: number;
  is_staff: boolean;
  member_count: number;
}
