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
