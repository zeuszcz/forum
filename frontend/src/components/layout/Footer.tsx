import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-void">
      <div className="container flex flex-col items-center justify-between gap-4 py-8 md:flex-row">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.svg" alt="" className="h-6 w-6" aria-hidden="true" />
          <span className="text-sm text-smoke">
            © {new Date().getFullYear()} endless·war — CS 1.6 jail community
          </span>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <Link href="/rules" className="text-smoke transition-colors hover:text-ash">
            Правила
          </Link>
          <Link href="/privacy" className="text-smoke transition-colors hover:text-ash">
            Приватность
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
