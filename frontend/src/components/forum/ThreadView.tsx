"use client";

import { useRef } from "react";

import { PostCard } from "@/components/forum/PostCard";
import { ReplyForm, type ReplyFormHandle } from "@/components/forum/ReplyForm";
import type { Post, Thread } from "@/lib/types";

interface ThreadViewProps {
  thread: Thread;
  posts: Post[];
}

export function ThreadView({ thread, posts }: ThreadViewProps) {
  const replyRef = useRef<ReplyFormHandle | null>(null);

  function handleQuote(post: Post) {
    replyRef.current?.insertQuote(post);
  }

  return (
    <div className="space-y-4">
      {posts.map((post, idx) => (
        <PostCard key={post.id} post={post} index={idx} onQuote={handleQuote} />
      ))}
      <div className="pt-4">
        <ReplyForm ref={replyRef} threadId={thread.id} threadLocked={thread.is_locked} />
      </div>
    </div>
  );
}
