import React, { useState, useRef, useEffect, useMemo } from "react";
import { CurrentAlertResponse, GroundContactPass } from "@/services/astraApi";

interface RightBriefingPanelProps {
  selectedNoradId: number;
  onSelectNoradId: (noradId: number) => void;
  satelliteList: Array<{ id: string | number; name: string; norad: string | number; cospar?: string | null; regime?: string }>;
  currentAlert: CurrentAlertResponse | null;
  groundContact: GroundContactPass | null;
  onOperatorFeedback: (label: "VALID_OPERATION" | "CONFIRMED_ANOMALY") => Promise<any>;
  isProcessingAction?: boolean;
}

export function RightBriefingPanel({
  selectedNoradId,
  onSelectNoradId,
  satelliteList,
  currentAlert,
  groundContact,
  onOperatorFeedback,
  isProcessingAction = false,
}: RightBriefingPanelProps) {
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Searchable Satellite Combobox State
  const [isFocused, setIsFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const comboboxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Currently selected satellite details
  const selectedSat = useMemo(() => {
    return satelliteList.find((s) => Number(s.norad) === selectedNoradId) || null;
  }, [satelliteList, selectedNoradId]);

  const selectedLabel = selectedSat
    ? `${selectedSat.name} — NORAD ${selectedSat.norad}`
    : `NORAD ${selectedNoradId}`;

  // Filter satellite catalog by name, NORAD ID, or COSPAR ID
  const filteredSatellites = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return satelliteList.slice(0, 100);
    return satelliteList.filter((sat) => {
      const name = (sat.name || "").toLowerCase();
      const noradStr = String(sat.norad || "");
      const cospar = (sat.cospar || "").toLowerCase();
      return name.includes(q) || noradStr.includes(q) || cospar.includes(q);
    }).slice(0, 100);
  }, [satelliteList, searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setIsFocused(false);
        setSearchQuery("");
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (isFocused && listRef.current && highlightedIndex >= 0) {
      const items = listRef.current.querySelectorAll(".combobox-result-item");
      const activeEl = items[highlightedIndex] as HTMLElement | undefined;
      if (activeEl) {
        const top = activeEl.offsetTop;
        const bottom = top + activeEl.offsetHeight;
        if (top < listRef.current.scrollTop) {
          listRef.current.scrollTop = top;
        } else if (bottom > listRef.current.scrollTop + listRef.current.offsetHeight) {
          listRef.current.scrollTop = bottom - listRef.current.offsetHeight;
        }
      }
    }
  }, [highlightedIndex, isFocused]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isFocused) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsFocused(true);
        setSearchQuery("");
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredSatellites.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % filteredSatellites.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredSatellites.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + filteredSatellites.length) % filteredSatellites.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredSatellites.length) {
        const chosen = filteredSatellites[highlightedIndex];
        handleSelectSatellite(Number(chosen.norad));
      } else if (filteredSatellites.length > 0) {
        handleSelectSatellite(Number(filteredSatellites[0].norad));
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsFocused(false);
      setSearchQuery("");
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }
  };

  const handleSelectSatellite = (noradId: number) => {
    onSelectNoradId(noradId);
    setIsFocused(false);
    setSearchQuery("");
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  // Real async operator feedback action
  const handleAction = async (label: "VALID_OPERATION" | "CONFIRMED_ANOMALY") => {
    try {
      await onOperatorFeedback(label);
      setFeedbackSuccess(label === "VALID_OPERATION" ? "PATTERN LEARNED" : "ANOMALY CONFIRMED");
      setFeedbackError(null);
      setTimeout(() => setFeedbackSuccess(null), 3500);
    } catch {
      setFeedbackError("FEEDBACK FAILED");
      setFeedbackSuccess(null);
      setTimeout(() => setFeedbackError(null), 3500);
    }
  };

  // Operational status states
  const status = currentAlert?.status || "NOMINAL";
  const isCritical = status === "CRITICAL_COMPONENT_ANOMALY" || currentAlert?.severity === "CRITICAL";
  const isWarning = status === "UNKNOWN_UNUSUAL_EVENT" || currentAlert?.severity === "WARNING";
  const isKnown = status === "KNOWN_OPERATIONAL_PATTERN";

  let statusBadge = "NOMINAL";
  let statusBadgeStyle = "text-[#39C98A] border-[#39C98A]/30 bg-[#39C98A]/10";
  let titleColor = "text-[#39C98A]";

  if (isCritical) {
    statusBadge = "GENUINE ANOMALY";
    statusBadgeStyle = "text-[#E05262] border-[#E05262]/30 bg-[#E05262]/10";
    titleColor = "text-[#E05262]";
  } else if (isWarning) {
    statusBadge = "UNKNOWN UNUSUAL EVENT";
    statusBadgeStyle = "text-[#D3B34A] border-[#D3B34A]/30 bg-[#D3B34A]/10";
    titleColor = "text-[#D3B34A]";
  } else if (isKnown) {
    statusBadge = "KNOWN OPERATIONAL PATTERN";
    statusBadgeStyle = "text-[#39C98A] border-[#39C98A]/30 bg-[#39C98A]/10";
    titleColor = "text-[#39C98A]";
  }

  return (
    <aside className="w-[380px] h-full panel-backdrop-right p-3.5 flex flex-col gap-3 text-[11px] overflow-y-auto custom-scrollbar z-20 shrink-0 select-none">
      
      {/* ========================================================================= */}
      {/* 1. TOP SECTION: SATELLITE PICTURE & SEARCHABLE TARGET COMBOBOX             */}
      {/* ========================================================================= */}
      <div className="subtle-section-bg p-3 rounded flex flex-col gap-2">
        <div className="flex items-center justify-between border-b border-[#668F87]/20 pb-1.5">
          <span className="text-[#B8C0BA] font-semibold tracking-wide text-[11px]">
            &gt; GLOBAL ORBITAL PICTURE
          </span>
          <span className="text-[9px] text-[#39C98A] font-medium tracking-wider">SGP4 PROPAGATED</span>
        </div>

        <div className="text-[10px] text-[#668F87] font-medium tracking-wide">
          NORAD / COSPAR / SATELLITE TARGET
        </div>

        {/* Spacecraft Searchable Combobox */}
        <div ref={comboboxRef} className="relative w-full font-mono">
          <div className="relative flex items-center w-full">
            <input
              ref={inputRef}
              type="text"
              value={isFocused ? searchQuery : selectedLabel}
              onFocus={() => {
                setIsFocused(true);
                setSearchQuery("");
                setHighlightedIndex(0);
              }}
              onClick={() => {
                if (!isFocused) {
                  setIsFocused(true);
                  setSearchQuery("");
                  setHighlightedIndex(0);
                }
              }}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={isFocused ? selectedLabel : "SEARCH SATELLITE..."}
              spellCheck={false}
              autoComplete="off"
              className={`w-full pl-2.5 pr-7 py-1.5 rounded text-[#D3B34A] font-semibold text-xs outline-none transition-colors border ${
                isFocused
                  ? "bg-[#020706] border-[#D3B34A]"
                  : "bg-black/70 border-[#668F87]/35 hover:border-[#668F87]/60 cursor-pointer"
              }`}
            />
            {isFocused && searchQuery.trim().length > 0 ? (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery("");
                  setHighlightedIndex(0);
                  inputRef.current?.focus();
                }}
                className="absolute right-2 text-[#71817B] hover:text-[#F6D365] text-xs leading-none p-1 transition-colors"
                title="Clear search"
              >
                ✕
              </button>
            ) : (
              <span
                className={`absolute right-2.5 text-[#668F87] text-[9px] pointer-events-none transition-transform duration-200 ${
                  isFocused ? "rotate-180" : ""
                }`}
              >
                ˅
              </span>
            )}
          </div>

          {/* Autocomplete Dropdown List */}
          {isFocused && (
            <div
              ref={listRef}
              className="absolute left-0 right-0 top-[calc(100%+2px)] max-h-56 overflow-y-auto bg-[#020706] border border-[#668F87]/45 border-t-[#D3B34A]/40 rounded-b shadow-[0_12px_28px_rgba(0,0,0,0.95)] z-50 custom-scrollbar"
            >
              {filteredSatellites.length === 0 ? (
                <div className="p-2.5 text-center text-[10px] text-[#71817B] italic">
                  NO SATELLITE FOUND FOR "{searchQuery}"
                </div>
              ) : (
                filteredSatellites.map((sat, idx) => {
                  const isSelected = Number(sat.norad) === selectedNoradId;
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <div
                      key={sat.norad}
                      onClick={() => handleSelectSatellite(Number(sat.norad))}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`combobox-result-item px-2.5 py-1.5 text-[10.5px] cursor-pointer border-b border-[#668F87]/10 flex items-center justify-between transition-colors ${
                        isSelected
                          ? "text-[#D3B34A] font-bold bg-[#D3B34A]/10"
                          : isHighlighted
                          ? "text-[#F6D365] bg-[#668F87]/25"
                          : "text-[#B8C0BA] hover:bg-[#668F87]/20 hover:text-[#F6D365]"
                      }`}
                    >
                      <span className="truncate pr-2">{sat.name} — NORAD {sat.norad}</span>
                      <span className="text-[8.5px] text-[#668F87] shrink-0 font-normal">
                        {sat.regime || "LEO"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="text-[9px] text-[#71817B] tracking-normal leading-normal">
          BACKEND-PROPAGATED SGP4 STATE · {satelliteList.length} TRACKED OBJECTS
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. OPERATIONAL EVENT BRIEFING                                              */}
      {/* ========================================================================= */}
      <div className="subtle-section-bg p-3 rounded flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-[#668F87]/20 pb-1.5">
          <div className="flex items-center gap-1.5 text-[#B8C0BA] font-semibold tracking-wide text-[11px]">
            <span className={isCritical ? "text-[#E05262]" : isWarning ? "text-[#D3B34A]" : "text-[#39C98A]"}>
              {isCritical ? "🚨" : isWarning ? "⚠" : "✓"}
            </span>
            <span>&gt; OPERATIONAL EVENT BRIEFING</span>
          </div>
          <span className={`text-[9px] font-medium border px-2 py-0.5 rounded tracking-wide ${statusBadgeStyle}`}>
            {statusBadge}
          </span>
        </div>

        {/* Real Event / Threat Title */}
        <div className={`text-xs font-semibold flex items-center justify-between tracking-wide ${titleColor}`}>
          <span>{currentAlert?.status?.replace(/_/g, " ") || "NOMINAL TELEMETRY"}</span>
          <span className="text-[9px] text-[#D3B34A] font-mono font-medium">
            {currentAlert ? `${currentAlert.unusualness_score.toFixed(2)}σ` : "--"}
          </span>
        </div>

        {/* What Changed */}
        <div className="flex flex-col gap-0.5 border-t border-[#668F87]/15 pt-1.5">
          <div className="text-[10px] font-medium text-[#668F87] tracking-wide">&gt; WHAT CHANGED</div>
          <div className="text-[10px] text-[#B8C0BA] leading-relaxed">
            {currentAlert ? (
              <>
                Unusualness score running at{" "}
                <span className="text-[#D3B34A] font-semibold">
                  {currentAlert.unusualness_score.toFixed(3)} / 3.000
                </span>
                . Affected channels:{" "}
                <span className="text-[#F6D365] font-semibold">
                  {currentAlert.affected_channels?.length ? currentAlert.affected_channels.join(", ") : "None (Nominal)"}
                </span>
              </>
            ) : (
              "No spacecraft-health event data is currently available."
            )}
          </div>
        </div>

        {/* Operational Context */}
        <div className="flex flex-col gap-0.5 border-t border-[#668F87]/15 pt-1.5">
          <div className="text-[10px] font-medium text-[#668F87] tracking-wide">&gt; OPERATIONAL CONTEXT</div>
          <div className="text-[9px] text-[#B8C0BA] leading-normal grid grid-cols-2 gap-x-3 gap-y-1 my-0.5">
            <div>
              <span className="text-[#668F87]">TC COMMANDS (5M):</span>{" "}
              <span className="text-[#B8C0BA] font-mono font-medium">
                {currentAlert?.recent_tc_count_5m ?? 0} EXECUTED
              </span>
            </div>
            <div>
              <span className="text-[#668F87]">EVENT CONTEXT:</span>{" "}
              <span className="text-[#B8C0BA] font-medium">
                {currentAlert?.category || "Nominal"}
              </span>
            </div>
            <div>
              <span className="text-[#668F87]">DETECTOR:</span>{" "}
              <span className="text-[#D3B34A] font-medium">GLOBAL_STD 3σ</span>
            </div>
            <div>
              <span className="text-[#668F87]">CHANNELS:</span>{" "}
              <span className="text-[#B8C0BA] font-mono font-medium">CH_41..CH_46</span>
            </div>
          </div>
        </div>

        {/* Adaptive Event Memory Assessment */}
        <div className="flex flex-col gap-1 border-t border-[#668F87]/15 pt-1.5">
          <div className="flex justify-between items-center text-[10px]">
            <span className="font-medium text-[#668F87] tracking-wide">&gt; ADAPTIVE EVENT MEMORY ASSESSMENT</span>
            <span className="text-[#39C98A] font-mono font-medium">
              SIMILARITY {currentAlert ? `${(currentAlert.similarity_score * 100).toFixed(1)}%` : "0.0%"}
            </span>
          </div>
          <div
            className={`text-[9px] px-2 py-1 rounded leading-normal border ${
              isKnown
                ? "bg-[#39C98A]/10 border-[#39C98A]/25 text-[#39C98A]"
                : isCritical
                ? "bg-[#E05262]/10 border-[#E05262]/25 text-[#E05262]"
                : "bg-[#D3B34A]/10 border-[#D3B34A]/25 text-[#D3B34A]"
            }`}
          >
            {isKnown
              ? "SIMILAR TO OPERATOR-VALIDATED OPERATIONAL PATTERN"
              : isCritical
              ? "LABELLED GENUINE ANOMALY (Historical ESA research event; memory did not suppress this detector event)"
              : currentAlert?.status === "NOMINAL"
              ? "NOMINAL SPACECRAFT TELEMETRY (No Operator Action Required)"
              : "UNKNOWN UNUSUAL EVENT (Operator Review Required)"}
          </div>
        </div>

        {/* Recommendation */}
        <div className="flex flex-col gap-1 border-t border-[#668F87]/15 pt-1.5 text-[10px]">
          <div className="text-[10px] font-medium text-[#668F87] tracking-wide">&gt; OPERATOR CONTEXT</div>
          <div className="text-[#B8C0BA] text-[9.5px] leading-relaxed">
            {currentAlert?.recommended_action || "No operator action is currently required."}
          </div>
          <div className="text-[#71817B] text-[8.5px] leading-relaxed">
            {currentAlert?.explanation || "Awaiting spacecraft-health event context."}
          </div>
        </div>

        {/* Operator actions appear only when there is an event to review. */}
        {currentAlert && currentAlert.status !== "NOMINAL" && (
        <div className="pt-2 border-t border-[#668F87]/15 flex items-center gap-2">
          <button
            onClick={() => handleAction("VALID_OPERATION")}
            disabled={isProcessingAction}
            className={`flex-1 py-1.5 rounded font-semibold text-xs tracking-wide transition-colors cursor-pointer ${
              feedbackSuccess === "PATTERN LEARNED"
                ? "bg-[#39C98A] text-[#020706]"
                : feedbackError
                ? "bg-[#E05262] text-white"
                : "bg-[#D3B34A] text-[#020706] hover:bg-[#e0c159]"
            }`}
          >
            {feedbackSuccess === "PATTERN LEARNED"
              ? "[✓] PATTERN LEARNED"
              : feedbackError
              ? "[!] FEEDBACK FAILED"
              : "[ LEARN PATTERN ]"}
          </button>
          <button
            onClick={() => handleAction("CONFIRMED_ANOMALY")}
            disabled={isProcessingAction}
            className={`px-3 py-1.5 rounded font-medium border text-xs transition-colors cursor-pointer ${
              feedbackSuccess === "ANOMALY CONFIRMED"
                ? "border-[#E05262] text-[#E05262] bg-[#E05262]/20"
                : "border-[#71817B]/30 text-[#B8C0BA] hover:border-[#E05262] hover:text-[#E05262]"
            }`}
          >
            {feedbackSuccess === "ANOMALY CONFIRMED" ? "[✓] CONFIRMED" : "[ ANOMALY ]"}
          </button>
        </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. GROUND CONTACT PASS — ASTRA REFERENCE GROUND STATION                    */}
      {/* ========================================================================= */}
      <div className="subtle-section-bg p-3 rounded flex flex-col gap-1.5">
        <div className="text-[#B8C0BA] font-semibold text-[10px] border-b border-[#668F87]/20 pb-1 leading-snug tracking-wide">
          &gt; GROUND CONTACT PASS — ASTRA REFERENCE GROUND STATION (17.385° N, 78.487° E)
        </div>

        <div className="flex items-center justify-between my-0.5">
          <span className="text-[#668F87] text-[10px] font-medium">PASS STATUS:</span>
          <span
            className={`px-2 py-0.5 rounded text-[9px] font-medium tracking-wider border ${
              groundContact?.is_visible
                ? "bg-[#39C98A]/15 text-[#39C98A] border-[#39C98A]/30 animate-pulse"
                : "bg-[#D3B34A]/15 text-[#D3B34A] border-[#D3B34A]/30"
            }`}
          >
            {groundContact?.is_visible ? "ABOVE HORIZON (ACTIVE)" : "BELOW HORIZON"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-[#B8C0BA] leading-normal">
          <div className="flex items-center justify-between pr-1">
            <span className="text-[#668F87] font-medium">AZIMUTH:</span>
            <span className="text-[#B8C0BA] font-mono font-medium">
              {groundContact?.azimuth_deg != null ? `${groundContact.azimuth_deg.toFixed(1)}°` : "--°"}
            </span>
          </div>
          <div className="flex items-center justify-between pl-1">
            <span className="text-[#668F87] font-medium">ELEVATION:</span>
            <span
              className={`font-mono font-medium ${
                groundContact && groundContact.elevation_deg >= 0 ? "text-[#39C98A]" : "text-[#D3B34A]"
              }`}
            >
              {groundContact?.elevation_deg != null ? `${groundContact.elevation_deg.toFixed(1)}°` : "--°"}
            </span>
          </div>
          <div className="flex items-center justify-between pr-1">
            <span className="text-[#668F87] font-medium">RANGE:</span>
            <span className="text-[#D3B34A] font-mono font-medium">
              {groundContact?.range_km != null ? `${groundContact.range_km.toFixed(1)} km` : "-- km"}
            </span>
          </div>
          <div className="flex items-center justify-between pl-1">
            <span className="text-[#668F87] font-medium">MAX ELEVATION:</span>
            <span className="text-[#D3B34A] font-mono font-medium">
              {groundContact?.max_elevation_deg != null ? `${groundContact.max_elevation_deg.toFixed(1)}°` : "--°"}
            </span>
          </div>
        </div>

        <div className="border-t border-[#668F87]/15 pt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-[#71817B] leading-normal">
          <div>
            <span className="text-[#668F87]">NEXT AOS (UTC):</span>{" "}
            <span className="text-[#B8C0BA] font-mono">{groundContact?.aos_utc || "--:--:--"}</span>
          </div>
          <div>
            <span className="text-[#668F87]">NEXT LOS (UTC):</span>{" "}
            <span className="text-[#B8C0BA] font-mono">{groundContact?.los_utc || "--:--:--"}</span>
          </div>
          <div>
            <span className="text-[#668F87]">PASS DURATION:</span>{" "}
            <span className="text-[#39C98A] font-mono font-medium">
              {groundContact?.pass_duration_minutes != null ? `${groundContact.pass_duration_minutes.toFixed(1)} min` : "-- min"}
            </span>
          </div>
          <div>
            <span className="text-[#668F87]">GROUND STATION:</span>{" "}
            <span className="text-[#B8C0BA]">ASTRA Ref GS (17.385° N, 78.487° E)</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default RightBriefingPanel;
