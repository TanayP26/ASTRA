"use client";

import React from "react";

interface StatusBarProps {
  catalogCount?: number;
  memoryCount?: number;
  alertStatus?: string;
  isBackendConnected?: boolean;
}

export function StatusBar({
  catalogCount,
  memoryCount = 0,
  alertStatus = "NOMINAL",
  isBackendConnected = true,
}: StatusBarProps) {
  const isNominal = alertStatus === "NOMINAL" || alertStatus === "KNOWN_OPERATIONAL_PATTERN";

  return (
    <footer className="astra-statusbar h-7 w-full bg-[#020706]/85 backdrop-blur-sm px-4 flex items-center justify-between text-[10px] z-50 shrink-0 select-none text-[#71817B] border-t border-[#668F87]/15">
      <div className="astra-status-left flex items-center gap-3">
        <span className="flex items-center gap-1.5 font-medium tracking-wide">
          <span
            className={`w-1.5 h-1.5 rounded-full inline-block ${
              isNominal ? "bg-[#39C98A]" : "bg-[#E05262] animate-ping"
            }`}
          />
          <span className={isNominal ? "text-[#39C98A]" : "text-[#E05262]"}>
            {alertStatus.replace(/_/g, " ")}
          </span>
        </span>
        <span className="text-[#668F87]/30">│</span>
        <span>
          <span className="text-[#668F87] font-medium">DETECTOR:</span>{" "}
          <span className="text-[#D3B34A] font-mono font-medium">GLOBAL_STD 3σ ACTIVE</span>
        </span>
        <span className="text-[#668F87]/30">│</span>
        <span>
          <span className="text-[#668F87] font-medium">EVENT MEMORY:</span>{" "}
          <span className="text-[#39C98A] font-mono font-medium">{memoryCount} PATTERNS STORED</span>
        </span>
        <span className="text-[#668F87]/30">│</span>
        <span>
          <span className="text-[#668F87] font-medium">CATALOG:</span>{" "}
          <span className="text-[#F6D365] font-mono font-medium">
            {catalogCount !== undefined ? `${catalogCount} TRACKED OBJECTS` : "SOURCE PENDING"}
          </span>
        </span>
      </div>

      <div className="astra-status-right flex items-center gap-3 text-[9px]">
        <span>
          <span className="text-[#668F87] font-medium">PROPAGATOR:</span>{" "}
          <span className="text-[#D3B34A] font-mono font-medium">SGP4 (BACKEND-PROPAGATED)</span>
        </span>
        <span className="text-[#668F87]/30">│</span>
        <span>
          <span className="text-[#668F87] font-medium">FRAME:</span>{" "}
          <span className="text-[#B8C0BA] font-mono">TEME / ECEF WGS-84</span>
        </span>
        <span className="text-[#668F87]/30">│</span>
        <span>
          <span className="text-[#668F87] font-medium">GS:</span>{" "}
          <span className="text-[#39C98A] font-medium">ASTRA REF GS (17.38° N)</span>
        </span>
        <span className="text-[#668F87]/30">│</span>
        <span
          className={`font-medium tracking-wide ${
            isBackendConnected ? "text-[#39C98A]" : "text-[#E05262]"
          }`}
        >
          {isBackendConnected ? "BACKEND: ONLINE 200 OK" : "BACKEND: DISCONNECTED"}
        </span>
      </div>
    </footer>
  );
}

export default StatusBar;
