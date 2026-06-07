"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_GROUPS = [
  {
    label: "INVEST",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
      {
        href: "/portfolio",
        label: "Portfolio",
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            <line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" />
          </svg>
        ),
      },
      {
        href: "/opportunities",
        label: "Opportunities",
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        ),
      },
      {
        href: "/committee",
        label: "Committee",
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "RESEARCH",
    items: [
      {
        href: "/research",
        label: "Research",
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      {
        href: "/automation",
        label: "Automation",
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        ),
      },
      {
        href: "/system",
        label: "System",
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8m-4-4v4" />
          </svg>
        ),
      },
    ],
  },
];

function NavItem({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      style={{ transition: "color 0.2s, background-color 0.2s" }}
      className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium ${
        active
          ? "text-[#3E6AE1] bg-[#EEF3FD]"
          : "text-[#5C5E62] hover:text-[#171A20] hover:bg-[#F4F4F4]"
      }`}
    >
      <span className={active ? "text-[#3E6AE1]" : "text-[#8E8E8E]"}>{icon}</span>
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const allItems = NAV_GROUPS.flatMap(g => g.items);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 bg-white border-r border-[#EEEEEE] flex-col shrink-0 min-h-screen sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-[#EEEEEE]">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3E6AE1" strokeWidth="2">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            <span className="text-[#171A20] font-medium text-sm tracking-wide">Investment OS</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <div className="px-3 pb-1 text-[10px] font-semibold text-[#AAAAAA] tracking-widest uppercase">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <NavItem key={item.href} {...item} active={isActive(item.href)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-[#EEEEEE]">
          <div className="text-xs text-[#AAAAAA]">Investment OS · 7 views</div>
        </div>
      </aside>

      {/* Mobile top bar — shows only the 7 nav icons */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#EEEEEE] flex items-center justify-between px-4 py-3">
        <span className="text-[#171A20] font-medium text-sm flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3E6AE1" strokeWidth="2">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
          Investment OS
        </span>
        <div className="flex gap-1">
          {allItems.map(({ href, icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                style={{ transition: "color 0.2s, background-color 0.2s" }}
                className={`p-2 rounded ${active ? "text-[#3E6AE1] bg-[#EEF3FD]" : "text-[#8E8E8E] hover:text-[#393C41]"}`}
              >
                {icon}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
