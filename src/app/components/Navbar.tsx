"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/transactions", label: "Transactions" },
  { href: "/clients", label: "Clients" },
  { href: "/real-estate", label: "Real Estate" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const links = NAV_LINKS;

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  // Signed out, there is no app to navigate — the only reachable page is the
  // login form, and it should stand alone rather than sitting under a nav bar.
  if (!isAuthenticated) return null;

  return (
    // sticky top-0 with NO md: visibility class — this bar covers the top of
    // the viewport at every size. Its height is what --top-nav-clearance
    // encodes (61px + safe area): change the padding here and change that.
    <nav
      className="sticky top-0 z-50 border-b border-white/10 bg-charcoal-dark/90 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-accent">My</span>
          <span className="text-sm text-white/60">Wallet</span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              // Prefix match, like the pill: /clients/abc is still "Clients".
              className={`text-sm transition-colors ${
                (link.href === "/" ? pathname === "/" : pathname.startsWith(link.href))
                  ? "text-accent font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* No "Sign in" branch: this whole bar only renders when signed in.
              The buttons here are h-9, not the usual 44px target: the nav row
              is 61px and --top-nav-clearance is that number, so a taller
              control silently pushes every sticky element out of alignment. */}
          <div className="hidden items-center gap-3 border-l border-white/10 pl-3 md:flex">
            {/* The username is the way to the account page (change password). */}
            <Link
              href="/account"
              title={user?.username}
              className={`max-w-[160px] truncate font-mono text-xs transition-colors ${
                pathname.startsWith("/account") ? "text-accent" : "text-white/50 hover:text-white"
              }`}
            >
              {user?.username}
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-md px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              Logout
            </button>
          </div>
          {/* On a phone the username is not shown, so the account page gets
              an icon of its own beside Logout — the same h-9 for the same
              reason. Its pathname check is the pill's prefix match. */}
          <Link
            href="/account"
            aria-label="Account"
            title={user?.username ? `Account (${user.username})` : "Account"}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-white/5 hover:text-white md:hidden ${
              pathname.startsWith("/account") ? "text-accent" : "text-white/60"
            }`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            title={user?.username ? `Log out (${user.username})` : "Log out"}
            className="flex h-9 w-9 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/5 hover:text-white md:hidden"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
