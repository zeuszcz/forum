import Link from "next/link";

import { CursorTrackingLogo } from "@/components/effects/CursorTrackingLogo";

export function Footer() {
  return (
    <footer className="relative z-[3] border-t border-border/60 bg-void/80 backdrop-blur">
      <div className="container flex flex-col items-center justify-between gap-4 py-8 md:flex-row">
        <div className="flex items-center gap-3">
          <CursorTrackingLogo />
          <span className="text-sm text-smoke">
            © {new Date().getFullYear()} endless·war — CS 1.6 jail community
          </span>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <Link href="/f/general" className="text-smoke transition-colors hover:text-ash">
            Форум
          </Link>
          <Link href="/banlist" className="text-smoke transition-colors hover:text-ash">
            Banlist
          </Link>
          <Link href="/archive" className="text-smoke transition-colors hover:text-ash">
            Архив
          </Link>
          <a
            href="https://github.com/zeuszcz/forum"
            target="_blank"
            rel="noopener noreferrer"
            className="text-smoke transition-colors hover:text-ash"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
