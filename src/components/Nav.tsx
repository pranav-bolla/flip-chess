"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";

const LINKS = [
  { href: "/play", label: "Play" },
  { href: "/duel", label: "Duel" },
  { href: "/daily", label: "Daily" },
];

export function Nav() {
  return <NavFrame pathname={usePathname()} />;
}

/** The nav itself; also rendered (without an active link) while the path is still unknown. */
export function NavFrame({ pathname }: { pathname: string }) {
  const { openSettings } = useApp();
  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex h-13 max-w-5xl items-center gap-1 px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="mr-auto text-[14px] font-semibold tracking-tight">
          FLIP <span className="font-normal text-muted">Chess</span>
        </Link>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={pathname === l.href || pathname.startsWith(`${l.href}/`) ? "page" : undefined}
            className={`btn btn-ghost h-8 px-2.5 sm:px-3 ${pathname === l.href || pathname.startsWith(`${l.href}/`) ? "text-text" : ""}`}
          >
            {l.label}
          </Link>
        ))}
        <button onClick={openSettings} className="btn btn-ghost h-8 px-2.5 sm:px-3">
          Settings
        </button>
      </nav>
    </header>
  );
}
