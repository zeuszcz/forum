export interface Role {
  slug: string;
  title: string;
  color: string;
  is_staff: boolean;
  affiliation_tag?: string | null;
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
  granted_perks: string[];
  /** Active perks with expiry metadata (permanent grants have expires_at=null). */
  perk_grants?: { slug: string; expires_at: string | null; source?: string | null }[];
  birthday?: string | null;
  nick_color?: string | null;
  avatar_glow_color?: string | null;
  thanks_received?: number;
  steam_id?: string | null;
  bonus_xp?: number;
  case_keys?: number;
  profile_banner_url?: string | null;
}

export interface Section {
  id: number;
  parent_id?: number | null;
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
  /** Direct children when this is a top-level (group) section. */
  children?: Section[];
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
  thread_title?: string | null;
  body: string;
  is_first: boolean;
  parent_post_id: number | null;
  edited_at: string | null;
  edited_by?: UserPublic | null;
  created_at: string;
  author: UserPublic | null;
  reaction_count: number;
  has_reacted: boolean;
  reactions_by_kind?: Record<string, number>;
  my_reaction_kinds?: string[];
  thanked_by?: string[];
}

export interface ActivityDay {
  date: string;
  posts: number;
  reactions: number;
}

export interface UserActivityResponse {
  days: ActivityDay[];
  total_days: number;
}

export type FeedEventKind =
  | "thread_created"
  | "post_created"
  | "reaction"
  | "user_registered";

export interface FeedEvent {
  kind: FeedEventKind;
  ts: string;
  actor: UserPublic | null;
  thread_id: number | null;
  thread_title: string | null;
  post_id: number | null;
}

export interface SectionPulse {
  section_id: number;
  count: number;
}

export type ReactionKind =
  | "like"
  | "fire"
  | "laugh"
  | "wow"
  | "sad"
  | "thinking"
  | "thanks";

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  like: "❤️",
  fire: "🔥",
  laugh: "😂",
  wow: "🤯",
  sad: "😢",
  thinking: "🤔",
  thanks: "🙏",
};

export interface ScandalThread {
  id: number;
  title: string;
  slug: string;
  section_slug: string | null;
  section_title: string | null;
  reply_count: number;
  view_count: number;
  score: number;
  last_post_at: string | null;
  created_at: string;
  author_nickname: string | null;
}

export interface BanlistEntry {
  id: number;
  nickname: string;
  avatar_url: string | null;
  ban_reason: string | null;
  banned_until: string | null;
}

export interface ArchiveEntry {
  id: number;
  title: string;
  section_id: number;
  reply_count: number;
  view_count: number;
  created_at: string;
  deleted_at: string;
}

export interface PollOption {
  id: number;
  text: string;
  display_order: number;
  vote_count: number;
}

export interface Poll {
  id: number;
  thread_id: number;
  question: string;
  multi: boolean;
  closed: boolean;
  total_votes: number;
  options: PollOption[];
  my_votes: number[];
}

export interface NotificationItem {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

export interface ThreadWithPosts {
  thread: Thread;
  posts: Post[];
  section: Section;
  total_posts: number;
}

export interface ShoutboxReplyPreview {
  id: number;
  body: string;
  author_nickname: string | null;
  is_deleted: boolean;
}

export type ShoutboxKind = "user" | "system" | "mapvote";

export interface MapVoteMeta {
  question?: string;
  options: string[];
  closes_at: string;
  server?: string | null;
}

export interface SystemMeta {
  tag?: string;
  category?: string;
}

export interface ShoutboxMessage {
  id: number;
  body: string;
  created_at: string;
  edited_at: string | null;
  is_pinned: boolean;
  is_deleted: boolean;
  kind?: ShoutboxKind;
  meta?: MapVoteMeta | SystemMeta | Record<string, unknown> | null;
  author: UserPublic | null;
  reply_to?: ShoutboxReplyPreview | null;
  reactions?: Partial<Record<ReactionKind, number>>;
  reacted?: ReactionKind[];
  vote_counts?: Record<string, number>;
  my_vote?: number | null;
}

export interface CsServerStatus {
  address: string;
  name: string;
  map: string | null;
  players: number;
  max_players: number;
  online: boolean;
  ping_ms: number | null;
  score_ct: number | null;
  score_t: number | null;
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
  granted_perks: string[];
  case_keys?: number;
  bonus_xp?: number;
}

export interface AdminPermissions {
  can_ban: boolean;
  can_mute: boolean;
  can_manage_threads: boolean;
  can_manage_users: boolean;
  can_manage_roles: boolean;
  can_grant_perks: boolean;
  can_view_audit: boolean;
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
  actor_nickname: string | null;
  target_user_id: number | null;
  target_user_nickname: string | null;
  target_post_id: number | null;
  target_thread_id: number | null;
  target_thread_title: string | null;
  target_section_id: number | null;
  target_section_title: string | null;
}

export interface CsPlayer {
  slot: number;
  name: string;
  userid: number;
  steamid: string;
  frag: number;
  time: string;
  ping: number;
  loss: number;
  addr: string;
}

export interface CsPlayersResponse {
  players: CsPlayer[];
  map: string | null;
  online: number;
  max_players: number | null;
}

export interface CsRconLogRead {
  id: number;
  command: string;
  response: string | null;
  success: boolean;
  error: string | null;
  latency_ms: number | null;
  created_at: string;
  actor_id: number | null;
  actor_nickname: string | null;
}

export interface RoleAdminRead {
  id: number;
  slug: string;
  title: string;
  color: string;
  display_order: number;
  is_staff: boolean;
  member_count: number;
  can_ban: boolean;
  can_mute: boolean;
  can_manage_threads: boolean;
  can_manage_users: boolean;
  can_manage_roles: boolean;
  can_grant_perks: boolean;
  can_view_audit: boolean;
}

/** Available perks that admins can grant manually (mirror backend ALLOWED_PERKS) */
export const GRANTABLE_PERKS = [
  { slug: "custom_title", label: "Кастомный титул", description: "Свободный текст под ником (lvl 25)" },
  { slug: "glow_nick", label: "Свечение ника", description: "Цветной ник со свечением в шоутбоксе и постах (lvl 50)" },
  { slug: "animated_frame", label: "Свечение аватара", description: "Цветное свечение вокруг аватара везде (lvl 15)" },
] as const;

