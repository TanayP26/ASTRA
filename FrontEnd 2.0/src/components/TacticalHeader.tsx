"use client";

import React, { useState, useEffect } from "react";

interface TacticalHeaderProps {
  activeNav: string;
  onSelectNav: (nav: string) => void;
  threatCount?: number;
  threatStatus?: string;
}

const NAV_ITEMS = [
  { id: "global", label: "ORBIT" },
  { id: "operations", label: "OPERATIONS" },
  { id: "research", label: "RESEARCH" },
  { id: "sources", label: "SOURCES" },
];

export function TacticalHeader({
  activeNav,
  onSelectNav,
  threatCount = 0,
  threatStatus = "NOMINAL",
}: TacticalHeaderProps) {
  const [utcNowStr, setUtcNowStr] = useState<string>("2026-09-13T00:00:00.000Z");

  useEffect(() => {
    const updateTime = () => {
      setUtcNowStr(new Date().toISOString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isThreatActive =
    threatCount > 0 ||
    threatStatus === "UNKNOWN_UNUSUAL_EVENT" ||
    threatStatus === "CRITICAL_COMPONENT_ANOMALY";

  return (
    <header className="astra-header h-12 w-full bg-transparent px-4 flex items-center justify-between text-xs z-50 shrink-0 select-none relative">
      {/* Soft Black Vignette Gradient Overlay */}
      <div 
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: "95px",
          zIndex: 0,
          background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.58) 35%, rgba(0, 0, 0, 0.25) 65%, rgba(0, 0, 0, 0) 100%)"
        }}
      />

      {/* Brand and primary navigation */}
      <div className="astra-header-left flex items-center relative z-10">
        {/* Brand Emblem */}
        <div className="brand flex items-center gap-2 text-[#D3B34A] font-semibold text-sm tracking-wider" style={{ marginRight: "80px" }}>
          <span className="text-xs text-[#D3B34A]">◇</span>
          <span className="font-semibold tracking-widest text-[#D3B34A]">ASTRA</span>
        </div>

        {/* Primary workspace navigation */}
        <nav className="nav flex items-center" style={{ display: "flex", gap: "8px" }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectNav(item.id)}
                className={`nav-item cursor-pointer ${isActive ? "active" : ""}`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Time, event status and console identity */}
      <div className="astra-header-status flex items-center gap-4 text-[11px] text-[#71817B] tracking-normal relative z-10">
        <div 
          className="astra-utc flex items-center gap-2 px-2.5 py-1 rounded select-none"
          style={{
            backgroundColor: "rgba(3, 16, 13, 0.88)",
            border: "1px solid rgba(102, 143, 135, 0.45)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.6)",
          }}
        >
          <span 
            className="font-semibold text-[10.5px] tracking-widest uppercase"
            style={{ color: "#B4D8CF" }}
          >
            UTC_NOW:
          </span>
          <span 
            className="font-mono text-[11.5px] font-semibold tracking-wider"
            style={{ 
              color: "#F6D365",
              textShadow: "0 0 8px rgba(246, 211, 101, 0.4)" 
            }}
            suppressHydrationWarning
          >
            {utcNowStr}
          </span>
        </div>
        <span className="text-[#668F87]/40">•</span>
        <span
          className={`font-medium px-2 py-0.5 rounded border text-[10px] tracking-wide ${
            isThreatActive
              ? "text-[#E05262] bg-[#E05262]/10 border-[#E05262]/30 animate-pulse"
              : "text-[#39C98A] bg-[#39C98A]/10 border-[#39C98A]/30"
          }`}
        >
          {isThreatActive ? `${threatCount} EVENT${threatCount === 1 ? "" : "S"} REQUIRING ATTENTION` : "SYSTEM NOMINAL"}
        </span>
        <span className="text-[#668F87]/40">•</span>
        <span className="astra-operator-role text-[#71817B] text-[10px] font-medium tracking-wide">OPERATIONS CONSOLE</span>
      </div>
    </header>
  );
}

export default TacticalHeader;
