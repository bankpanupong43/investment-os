"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export type WatchlistStatus = "watching" | "researching" | "high_conviction" | "rejected" | "owned";

const STATUS_LABELS: Record<WatchlistStatus, string> = {
  watching:        "Watching",
  researching:     "Researching",
  high_conviction: "High Conviction",
  rejected:        "Rejected",
  owned:           "Owned",
};

const STATUS_STYLE: Record<WatchlistStatus, { bg: string; text: string }> = {
  watching:        { bg: "bg-[#EEF3FD]", text: "text-[#3E6AE1]" },
  researching:     { bg: "bg-[#fffbeb]", text: "text-[#b45309]" },
  high_conviction: { bg: "bg-[#eef7f1]", text: "text-[#2d7d46]" },
  rejected:        { bg: "bg-[#fdf0ee]", text: "text-[#c0392b]" },
  owned:           { bg: "bg-[#F4F4F4]", text: "text-[#5C5E62]" },
};

// Estimated heights for positioning logic (conservative — better to over-estimate)
const MENU_HEIGHT  = 240; // status menu: header + 5 items + divider + remove
const ADD_HEIGHT   = 200; // add form: label + textarea + 3 buttons
const VIEWPORT_PAD = 8;   // minimum gap from viewport edge

interface PopupStyle {
  position: "fixed";
  top?: number;
  bottom?: number;
  left: number;
  zIndex: number;
}

function calcPopupStyle(trigger: HTMLElement, estimatedHeight: number): PopupStyle {
  const r = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: align to left edge of trigger, clamp so it doesn't overflow right
  const popWidth = estimatedHeight === ADD_HEIGHT ? 256 : 176; // w-64 = 256, w-44 = 176
  const left = Math.min(r.left, vw - popWidth - VIEWPORT_PAD);

  const spaceBelow = vh - r.bottom;
  const spaceAbove = r.top;

  if (spaceBelow >= estimatedHeight + VIEWPORT_PAD || spaceBelow >= spaceAbove) {
    // Open downward
    return { position: "fixed", top: r.bottom + 4, left, zIndex: 9999 };
  } else {
    // Open upward: anchor bottom of popup to top of trigger
    return { position: "fixed", bottom: vh - r.top + 4, left, zIndex: 9999 };
  }
}

interface WatchlistButtonProps {
  ticker: string;
  companyName?: string | null;
  initiallyWatched?: boolean;
  initialStatus?: WatchlistStatus;
  initialId?: string;
  size?: "sm" | "xs";
  onAdded?: (id: string, status: WatchlistStatus) => void;
  onRemoved?: () => void;
  onStatusChanged?: (status: WatchlistStatus) => void;
}

export function WatchlistButton({
  ticker,
  companyName,
  initiallyWatched = false,
  initialStatus = "watching",
  initialId,
  size = "sm",
  onAdded,
  onRemoved,
  onStatusChanged,
}: WatchlistButtonProps) {
  const [watched, setWatched]         = useState(initiallyWatched);
  const [status, setStatus]           = useState<WatchlistStatus>(initialStatus);
  const [itemId, setItemId]           = useState<string | null>(initialId ?? null);
  const [loading, setLoading]         = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [showMenu, setShowMenu]       = useState(false);
  const [reason, setReason]           = useState("");
  const [popStyle, setPopStyle]       = useState<PopupStyle | null>(null);
  const [mounted, setMounted]         = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef     = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const openAdd = useCallback(() => {
    if (!triggerRef.current) return;
    setPopStyle(calcPopupStyle(triggerRef.current, ADD_HEIGHT));
    setShowAdd(true);
    setShowMenu(false);
  }, []);

  const openMenu = useCallback(() => {
    if (!triggerRef.current) return;
    setPopStyle(calcPopupStyle(triggerRef.current, MENU_HEIGHT));
    setShowMenu(true);
    setShowAdd(false);
  }, []);

  const closeAll = useCallback(() => { setShowAdd(false); setShowMenu(false); }, []);

  useEffect(() => {
    if (!showMenu && !showAdd) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        (popRef.current && popRef.current.contains(t)) ||
        (triggerRef.current && triggerRef.current.contains(t))
      ) return;
      closeAll();
    }
    function onScroll() { closeAll(); }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [showMenu, showAdd, closeAll]);

  async function handleAdd(selectedStatus: WatchlistStatus) {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name: companyName, interestReason: reason.trim(), status: selectedStatus }),
      });
      if (res.ok) {
        const item = await res.json();
        setWatched(true);
        setStatus(selectedStatus);
        setItemId(item.id);
        closeAll();
        setReason("");
        onAdded?.(item.id, selectedStatus);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resolveId(): Promise<string | null> {
    if (itemId) return itemId;
    const res = await fetch("/api/watchlist");
    if (!res.ok) return null;
    const items: { id: string; ticker: string }[] = await res.json();
    const found = items.find(i => i.ticker === ticker);
    if (found) setItemId(found.id);
    return found?.id ?? null;
  }

  async function handleRemove() {
    setLoading(true);
    closeAll();
    try {
      const id = await resolveId();
      const url = id ? `/api/watchlist/${id}` : `/api/watchlist?ticker=${ticker}`;
      await fetch(url, { method: "DELETE" });
      setWatched(false);
      setItemId(null);
      onRemoved?.();
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(newStatus: WatchlistStatus) {
    closeAll();
    setLoading(true);
    try {
      const id = await resolveId();
      if (!id) return;
      const res = await fetch(`/api/watchlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
        onStatusChanged?.(newStatus);
      }
    } finally {
      setLoading(false);
    }
  }

  const baseText = size === "xs" ? "text-[10px]" : "text-xs";

  if (!watched) {
    return (
      <>
        <button
          ref={triggerRef}
          onClick={() => showAdd ? closeAll() : openAdd()}
          disabled={loading}
          className={`${baseText} font-medium px-2 py-0.5 rounded border border-[#EEEEEE] text-[#8E8E8E] hover:border-[#3E6AE1] hover:text-[#3E6AE1] transition-colors disabled:opacity-40`}
        >
          + Watch
        </button>
        {mounted && showAdd && popStyle && createPortal(
          <div ref={popRef} style={popStyle} className="bg-white border border-[#EEEEEE] rounded-xl shadow-xl p-3 w-64">
            <p className="text-[10px] font-semibold text-[#8E8E8E] uppercase mb-2">Add {ticker} to Watchlist</p>
            <textarea
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why are you watching this?"
              rows={2}
              className="w-full text-xs border border-[#EEEEEE] rounded px-2 py-1.5 text-[#171A20] placeholder:text-[#AAAAAA] focus:outline-none focus:border-[#3E6AE1] resize-none mb-2"
            />
            <div className="flex flex-wrap gap-1">
              {(["watching", "researching", "high_conviction"] as WatchlistStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleAdd(s)}
                  disabled={loading || !reason.trim()}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded disabled:opacity-40 ${STATUS_STYLE[s].bg} ${STATUS_STYLE[s].text} hover:opacity-80`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  const style = STATUS_STYLE[status] ?? STATUS_STYLE.watching;
  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => showMenu ? closeAll() : openMenu()}
        disabled={loading}
        className={`${baseText} font-semibold px-2 py-0.5 rounded ${style.bg} ${style.text} disabled:opacity-40`}
      >
        {STATUS_LABELS[status]} ▾
      </button>
      {mounted && showMenu && popStyle && createPortal(
        <div ref={popRef} style={popStyle} className="bg-white border border-[#EEEEEE] rounded-xl shadow-xl py-1 w-44">
          <p className="text-[10px] text-[#AAAAAA] px-3 pt-1 pb-1.5 font-semibold uppercase">Change Status</p>
          {(Object.entries(STATUS_LABELS) as [WatchlistStatus, string][]).map(([s, label]) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s as WatchlistStatus)}
              className={`w-full text-left text-xs px-3 py-1.5 hover:bg-[#F4F4F4] ${s === status ? "font-semibold text-[#171A20]" : "text-[#5C5E62]"}`}
            >
              {label}
            </button>
          ))}
          <div className="border-t border-[#EEEEEE] mt-1 pt-1">
            <button
              onClick={handleRemove}
              className="w-full text-left text-xs px-3 py-1.5 text-[#c0392b] hover:bg-[#fdf0ee]"
            >
              Remove from Watchlist
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
