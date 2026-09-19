"use client";

import React from "react";
import {
  ObjectDetailResponse,
  CurrentAlertResponse,
  MemoryBankResponse,
  SourcesStatusResponse,
  StatisticsResponse,
} from "@/services/astraApi";

interface LeftInspectorPanelProps {
  activeNav: string;
  selectedNoradId: number;
  objectDetail: ObjectDetailResponse | null;
  currentAlert: CurrentAlertResponse | null;
  memoryBank: MemoryBankResponse | null;
  sourcesStatus: SourcesStatusResponse | null;
  researchStats: StatisticsResponse | null;
  fleetStatus: any;
  spacecraftOverview: any;
}

export function LeftInspectorPanel({
  activeNav,
  selectedNoradId,
  objectDetail,
  currentAlert,
  memoryBank,
  sourcesStatus,
  researchStats,
  fleetStatus,
  spacecraftOverview,
}: LeftInspectorPanelProps) {
  const src = objectDetail?.source_values;
  const prop = objectDetail?.derived_propagated_values;
  const satnogs = objectDetail?.satnogs_data;

  // Derive truthful SatNOGS status
  const getSatnogsStatusText = (): string => {
    if (!satnogs) return "SOURCE UNAVAILABLE";
    if (satnogs.overall_status) return satnogs.overall_status;
    if (satnogs.source_status === "LIVE_ONLINE" && (satnogs.has_observations || satnogs.observations?.count > 0)) {
      return "AVAILABLE";
    }
    if (satnogs.has_recent_observations === false) {
      return "NO RECENT DATA";
    }
    if (satnogs.has_decoder === false) {
      return "NO DECODER";
    }
    return satnogs.source_status || "SOURCE UNAVAILABLE";
  };

  const satnogsStatus = getSatnogsStatusText();
  const isSatnogsAvailable = satnogsStatus === "AVAILABLE" || satnogsStatus === "LIVE_ONLINE";

  return (
    <aside className="w-[360px] h-full panel-backdrop-left p-3 flex flex-col gap-2.5 font-mono text-[11px] overflow-y-auto custom-scrollbar z-20 shrink-0 select-none">
      
      {/* ========================================================================= */}
      {/* 1. TOP FIXED SECTION: SELECTED SPACE OBJECT INSPECTOR (ALWAYS VISIBLE)    */}
      {/* ========================================================================= */}
      <div className="subtle-section-bg p-3 rounded flex flex-col gap-2">
        {/* Title Header */}
        <div className="flex items-center justify-between border-b border-[#668F87]/20 pb-1.5">
          <div className="text-[#D3B34A] font-semibold tracking-wider text-[11px]">
            &gt; SELECTED SPACE OBJECT INSPECTOR
          </div>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-[#D3B34A]/15 text-[#D3B34A] rounded border border-[#D3B34A]/30">
            {objectDetail ? "TRACKING" : "CONNECTING..."}
          </span>
        </div>

        {/* Spacecraft Target Name & Identifiers */}
        <div className="flex flex-col gap-0.5 text-slate-200">
          <div className="text-sm font-bold text-[#F6D365] tracking-wide flex items-center justify-between">
            <span className="truncate pr-2">{objectDetail?.name || `NORAD ${selectedNoradId}`}</span>
            <span className="text-[10px] text-[#39C98A] shrink-0 font-medium">
              {objectDetail?.orbit_regime || "LEO"} {prop?.altitude_km != null ? `${prop.altitude_km.toFixed(0)} km` : ""}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9.5px] text-[#71817B] mt-0.5">
            <div>NORAD ID: <span className="text-[#B8C0BA] font-semibold">{objectDetail?.norad_id || selectedNoradId}</span></div>
            <div>COSPAR ID: <span className="text-[#B8C0BA] font-semibold">{objectDetail?.cospar_id || "N/A"}</span></div>
            <div>OBJECT TYPE: <span className="text-[#39C98A] font-medium">{objectDetail?.object_type || "ACTIVE_SPACECRAFT"}</span></div>
            <div>REGIME: <span className="text-[#39C98A] font-medium">{objectDetail?.orbit_regime || "LEO"}</span></div>
          </div>
        </div>

        {/* Current Propagated State (Backend SGP4) */}
        <div className="border-t border-[#668F87]/20 pt-1.5 flex flex-col gap-1">
          <div className="text-[10px] font-semibold text-[#D3B34A] flex items-center justify-between">
            <span>&gt; CURRENT PROPAGATED STATE (BACKEND SGP4)</span>
            <span className="text-[8.5px] text-[#39C98A] animate-pulse">● CURRENT PROPAGATION</span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9.5px]">
            <div className="flex justify-between">
              <span className="text-[#71817B]">LATITUDE:</span>
              <span className="text-[#F6D365] font-semibold">
                {prop?.latitude !== undefined && prop?.latitude !== null
                  ? `${Math.abs(prop.latitude).toFixed(4)}° ${prop.latitude >= 0 ? "N" : "S"}`
                  : "--"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71817B]">LONGITUDE:</span>
              <span className="text-[#F6D365] font-semibold">
                {prop?.longitude !== undefined && prop?.longitude !== null
                  ? `${Math.abs(prop.longitude).toFixed(4)}° ${prop.longitude >= 0 ? "E" : "W"}`
                  : "--"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71817B]">ALTITUDE:</span>
              <span className="text-[#39C98A] font-semibold">
                {prop?.altitude_km != null ? `${prop.altitude_km.toFixed(1)} km` : "--"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71817B]">VELOCITY:</span>
              <span className="text-[#D3B34A] font-semibold">
                {prop?.velocity_kms != null ? `${prop.velocity_kms.toFixed(3)} km/s` : "--"}
              </span>
            </div>
          </div>
          <div className="text-[8.5px] text-[#71817B] truncate mt-0.5">
            STATE TIMESTAMP (UTC): <span className="text-[#B8C0BA]">{prop?.propagated_timestamp || "SYNCING..."}</span>
          </div>
        </div>

        {/* Real Source Orbital Elements (CelesTrak GP/OMM) */}
        <div className="border-t border-[#668F87]/20 pt-1.5 flex flex-col gap-0.5 text-[9.5px]">
          <div className="text-[10px] font-semibold text-[#B8C0BA]">
            &gt; SOURCE ORBITAL ELEMENTS (CelesTrak GP/OMM)
          </div>
          <div className="grid grid-cols-2 gap-x-2 text-[#71817B] text-[9px]">
            <div>INCLINATION: <span className="text-[#B8C0BA]">{src?.inclination_deg != null ? `${src.inclination_deg.toFixed(4)}°` : "--"}</span></div>
            <div>ECCENTRICITY: <span className="text-[#B8C0BA]">{src?.eccentricity != null ? src.eccentricity.toFixed(6) : "--"}</span></div>
            <div>MEAN MOTION: <span className="text-[#B8C0BA]">{src?.mean_motion != null ? `${src.mean_motion.toFixed(4)} rev/d` : "--"}</span></div>
            <div>SEMI-MAJOR AXIS: <span className="text-[#B8C0BA]">{prop?.semi_major_axis_km != null ? `${prop.semi_major_axis_km.toFixed(1)} km` : "--"}</span></div>
            <div>APOGEE / PERIGEE: <span className="text-[#B8C0BA]">{prop?.apogee_km != null && prop?.perigee_km != null ? `${prop.apogee_km.toFixed(0)} / ${prop.perigee_km.toFixed(0)} km` : "--"}</span></div>
            <div>ORBIT PERIOD: <span className="text-[#B8C0BA]">{prop?.period_minutes != null ? `${prop.period_minutes.toFixed(1)} min` : "--"}</span></div>
            <div>ELEMENT EPOCH: <span className="text-[#B8C0BA] truncate block">{src?.element_epoch ? src.element_epoch.substring(0, 19) : "--"}</span></div>
            <div>ELEMENT AGE: <span className="text-[#D3B34A]">{prop?.element_age_hours != null ? `${prop.element_age_hours.toFixed(1)} hrs` : "--"}</span></div>
          </div>
        </div>

        {/* Source Provenance & Attribution */}
        <div className="border-t border-[#668F87]/20 pt-1.5 flex flex-col gap-0.5 text-[9.5px]">
          <div className="text-[10px] font-semibold text-[#D3B34A]">
            &gt; SOURCE PROVENANCE & ATTRIBUTION
          </div>
          <div className="text-[8.5px] text-[#71817B]">
            PROVIDER: <span className="text-[#B8C0BA] font-medium">{src?.provider || "CelesTrak GP/OMM"}</span>
          </div>
          <div className="text-[8.5px] text-[#71817B]">
            ENGINE: <span className="text-[#39C98A] font-semibold">BACKEND SGP4 (WGS-72 NUMERICAL PROPAGATOR)</span>
          </div>
          <div className="text-[8.5px] text-[#71817B]">
            TELEMETRY SCOPE: <span className="text-[#E05262] font-semibold">NO AUTHORIZED MISSION TELEMETRY (PUBLIC ORBITAL DATA)</span>
          </div>
        </div>

        {/* Truthful SatNOGS Community Ground Network Data (No fake waveforms) */}
        <div className="border-t border-[#668F87]/20 pt-1.5 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-[#D3B34A]">&gt; SATNOGS COMMUNITY GROUND NETWORK</span>
            <span className={`font-semibold text-[8.5px] px-1.5 py-0.2 rounded border ${
              isSatnogsAvailable 
                ? "text-[#39C98A] bg-[#39C98A]/10 border-[#39C98A]/30" 
                : "text-[#71817B] bg-[#71817B]/10 border-[#71817B]/30"
            }`}>
              {satnogsStatus}
            </span>
          </div>

          <div className="p-2 rounded bg-[#020706] border border-[#668F87]/20 flex flex-col gap-1 text-[9px]">
            <div className="flex justify-between">
              <span className="text-[#71817B]">RECENT OBSERVATIONS:</span>
              <span className="text-[#B8C0BA] font-medium">
                {satnogs?.observations?.count !== undefined
                  ? `${satnogs.observations.count} records`
                  : satnogs?.observations?.length !== undefined
                  ? `${satnogs.observations.length} records`
                  : "Unavailable"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71817B]">LATEST OBSERVATION:</span>
              <span className="text-[#B8C0BA] truncate max-w-[180px]">
                {satnogs?.latest_observation?.timestamp || satnogs?.observations?.latest?.timestamp || "Unavailable"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#71817B]">DECODED TELEMETRY:</span>
              <span className={satnogs?.telemetry?.frame_count ? "text-[#39C98A]" : "text-[#71817B]"}>
                {satnogs?.telemetry?.frame_count !== undefined && satnogs?.telemetry?.frame_count > 0
                  ? `${satnogs.telemetry.frame_count} frames decoded`
                  : "No public decoder / data available"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. BOTTOM DYNAMIC SECTION (SWITCHES CONTENT BASED ON ACTIVE NAV TAB)       */}
      {/* ========================================================================= */}
      <div className="flex-1 subtle-section-bg p-3 rounded flex flex-col gap-2 min-h-[220px]">
        
        {/* TAB 1: GLOBAL ORBITAL PICTURE & DISCOVERY */}
        {activeNav === "global" && (
          <>
            <div className="flex items-center justify-between border-b border-[#668F87]/20 pb-1 text-[#D3B34A] font-semibold">
              <span>&gt; GLOBAL CATALOG DISCOVERY</span>
              <span className="text-[9px] text-[#39C98A] font-medium">SGP4 PROPAGATED</span>
            </div>
            <div className="flex flex-col gap-1.5 text-[9.5px] text-slate-300 overflow-y-auto custom-scrollbar flex-1 pr-1">
              <div className="border-b border-[#668F87]/10 pb-1">
                <span className="text-[#D3B34A] font-semibold">PROPAGATION ENGINE:</span> SGP4 (WGS-72 Numerical Engine on Backend)
              </div>
              <div className="border-b border-[#668F87]/10 pb-1">
                <span className="text-[#D3B34A] font-semibold">CADENCE:</span> Full-catalog snapshot updates about every 3s; selected-object WebSocket updates at 1 Hz
              </div>
              <div className="border-b border-[#668F87]/10 pb-1">
                <span className="text-[#D3B34A] font-semibold">GROUND TRACKS:</span> Instantaneous Azimuth/Elevation to ASTRA Reference Ground Station
              </div>
              <div className="text-[8.5px] text-[#71817B] mt-1 leading-normal">
                Select any satellite on the 3D Globe Canvas or via the Target Selector on the right to inspect recent orbital elements and its current SGP4-propagated trajectory.
              </div>
            </div>
          </>
        )}

        {/* TAB 2: AUTHORIZED FLEET */}
        {activeNav === "fleet" && (
          <>
            <div className="text-[#D3B34A] font-semibold border-b border-[#668F87]/20 pb-1">
              &gt; AUTHORIZED MISSION FLEET CONFIGURATION
            </div>
            <div className="flex flex-col gap-1 text-[9.5px] text-slate-300">
              <div className="text-[#E05262] font-semibold">NO AUTHORIZED FLEET CONNECTED</div>
              <div>FLEET STATUS: <span className="text-[#E05262] font-semibold">UNCONNECTED (0 ASSETS)</span></div>
              <div className="text-[8.5px] text-[#71817B]">
                {fleetStatus?.detail || "ASTRA is operating in Global Orbital Awareness and Research Validation mode. No production spacecraft telemetry stream is currently connected."}
              </div>
              <div className="border-t border-[#668F87]/10 pt-1 mt-1">
                PRIMARY PROVIDER: <span className="text-[#D3B34A]">UNCONFIGURED</span>
              </div>
              <div>INTEGRATION READINESS: <span className="text-[#39C98A] font-semibold">STANDBY FOR MISSION ADAPTER</span></div>
              <div className="border-t border-[#668F87]/10 pt-1 mt-1 text-[8.5px] text-[#71817B] leading-snug">
                Data boundary: public orbital elements remain separate from authorized mission telemetry. Historical validation material is available under OPERATIONS and RESEARCH.
              </div>
            </div>
          </>
        )}

        {/* TAB 3: SPACECRAFT TELEMETRY (ESA MISSION-1 ARCHIVE) */}
        {activeNav === "spacecraft" && (
          <>
            <div className="text-[#D3B34A] font-semibold border-b border-[#668F87]/20 pb-1">
              &gt; SPACECRAFT TELEMETRY CHANNELS (ESA MISSION-1)
            </div>
            <div className="flex flex-col gap-1 text-[9.5px] text-slate-300">
              <div className="text-[#39C98A] font-semibold">ESA ADB MISSION-1 RESEARCH ARCHIVE</div>
              <div className="text-[8.5px] text-[#71817B]">STREAM: HISTORICAL RESEARCH BENCHMARK</div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {spacecraftOverview?.parameters?.map((p: any) => (
                  <div key={p.parameter_id} className="p-1 rounded bg-[#020706] border border-[#668F87]/20 text-[8.5px]">
                    <span className="text-[#D3B34A] font-bold">{p.name}</span>
                    <div className="text-[#71817B] truncate">Anonymized research channel</div>
                  </div>
                )) || (
                  ["CH_41", "CH_42", "CH_43", "CH_44", "CH_45", "CH_46"].map((ch) => (
                    <div key={ch} className="p-1 rounded bg-[#020706] border border-[#668F87]/20 text-[8.5px]">
                      <span className="text-[#D3B34A] font-bold">{ch}</span>
                      <div className="text-[#71817B]">Anonymized research channel</div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-[#668F87]/10 pt-1 mt-1 text-[8.5px] text-[#71817B]">
                Active channels: 6 monitored channels spanning 14-year flight archive.
              </div>
            </div>
          </>
        )}

        {/* TAB 4: HISTORICAL RESEARCH ALERTS */}
        {activeNav === "alerts" && (
          <>
            <div className="text-[#D3B34A] font-semibold border-b border-[#668F87]/20 pb-1">
              &gt; HISTORICAL RESEARCH ALERT ARCHIVE
            </div>
            <div className="flex flex-col gap-1.5 text-[9.5px] text-slate-300 overflow-y-auto custom-scrollbar flex-1">
              <div className="text-[8.5px] text-[#71817B] leading-snug">
                Evaluation alert windows extracted from the ESA Mission-1 archive. Validated under Adaptive Event Memory.
              </div>

              <div className="border border-[#39C98A]/30 p-1.5 rounded bg-[#020706] flex flex-col gap-0.5">
                <div className="text-[#39C98A] font-bold text-[9px]">WINDOW #01 — NOMINAL TELEMETRY</div>
                <div className="flex justify-between text-[8px] text-[#71817B]">
                  <span>STATUS: <span className="text-[#39C98A]">NOMINAL</span></span>
                  <span>UNUSUALNESS: 0.420 / 3.000</span>
                </div>
                <div className="text-[8px] text-[#B8C0BA]">Operating within baseline 3-sigma tolerance bounds.</div>
              </div>

              <div className="border border-[#D3B34A]/30 p-1.5 rounded bg-[#020706] flex flex-col gap-0.5">
                <div className="text-[#D3B34A] font-bold text-[9px]">WINDOW #02 — RARE OPERATIONAL EVENT</div>
                <div className="flex justify-between text-[8px] text-[#71817B]">
                  <span>STATUS: <span className="text-[#D3B34A]">KNOWN OPERATIONAL PATTERN</span></span>
                  <span>SCORE: 2.140 / 3.000</span>
                </div>
                <div className="text-[8px] text-[#B8C0BA]">Validated operational event pattern (CH_41, CH_43).</div>
              </div>

              <div className="border border-[#E05262]/30 p-1.5 rounded bg-[#020706] flex flex-col gap-0.5">
                <div className="text-[#E05262] font-bold text-[9px]">WINDOW #03 — LABELLED GENUINE ANOMALY</div>
                <div className="flex justify-between text-[8px] text-[#71817B]">
                  <span>STATUS: <span className="text-[#E05262]">GENUINE ANOMALY</span></span>
                  <span>SCORE: 3.820 / 3.000</span>
                </div>
                <div className="text-[8px] text-[#B8C0BA]">Labelled genuine anomaly window (CH_41..CH_46). Historical ESA research event. The safety guard prevents false suppression.</div>
              </div>
            </div>
          </>
        )}

        {/* TAB 5: OPERATIONS & ADAPTIVE EVENT MEMORY */}
        {activeNav === "operations" && (
          <>
            <div className="text-[#D3B34A] font-semibold border-b border-[#668F87]/20 pb-1">
              &gt; ADAPTIVE EVENT MEMORY
            </div>

            <div className="text-[8.5px] text-[#39C98A] border-b border-[#668F87]/10 pb-1 flex items-center justify-between">
              <span>UNUSUAL EVENT</span>
              <span>→</span>
              <span>CONTEXT</span>
              <span>→</span>
              <span>MEMORY MATCH</span>
              <span>→</span>
              <span>OPERATOR REVIEW</span>
            </div>

            <div className="flex flex-col gap-2 text-[9.5px] text-slate-300 mt-0.5">
              <div className="p-2 rounded bg-[#020706] border border-[#668F87]/20">
                <div className="text-[#B8C0BA] font-semibold text-[9px] mb-1">CURRENT MEMORY STATE</div>
                <div className="flex justify-between text-[8.5px]">
                  <span className="text-[#71817B]">STORED PATTERNS</span>
                  <span className="text-[#39C98A] font-bold">{memoryBank?.count ?? 0}</span>
                </div>
                <div className="flex justify-between text-[8.5px]">
                  <span className="text-[#71817B]">CURRENT ASSESSMENT</span>
                  <span className="text-[#D3B34A] font-bold">
                    {currentAlert?.status?.replace(/_/g, " ") || "NO EVENT DATA"}
                  </span>
                </div>
                <div className="flex justify-between text-[8.5px]">
                  <span className="text-[#71817B]">MEMORY SIMILARITY</span>
                  <span className="text-[#F6D365] font-bold">
                    {currentAlert ? `${(currentAlert.similarity_score * 100).toFixed(1)}%` : "--"}
                  </span>
                </div>
                <div className="flex justify-between text-[8.5px]">
                  <span className="text-[#71817B]">UNUSUALNESS</span>
                  <span className="text-[#F6D365] font-bold">
                    {currentAlert ? `${currentAlert.unusualness_score.toFixed(3)} / 3.000` : "--"}
                  </span>
                </div>
              </div>

              <div className="p-2 rounded border border-[#D3B34A]/20 bg-[#D3B34A]/5">
                <div className="text-[#D3B34A] font-bold text-[9px] mb-1">OPERATOR WORKFLOW</div>
                <div className="text-[8.5px] text-[#B8C0BA] leading-relaxed">
                  ASTRA detects unusual telemetry, adds command context, checks for similar operator-validated events,
                  and presents the evidence for human review.
                </div>
              </div>

              <div className="text-[8px] text-[#71817B] leading-snug">
                Current spacecraft-health evidence is based on the ESA Mission-1 historical research archive until an authorized mission telemetry source is connected.
              </div>
            </div>
          </>
        )}

        {/* TAB 6: DATA SOURCES PROVENANCE MATRIX */}
        {activeNav === "sources" && (
          <>
            <div className="text-[#D3B34A] font-semibold border-b border-[#668F87]/20 pb-1 flex items-center justify-between">
              <span>&gt; DATA SOURCES & PROVENANCE MATRIX</span>
              <span className="text-[8.5px] text-[#39C98A] font-bold">ACTIVE</span>
            </div>
            <div className="flex flex-col gap-1 text-[8.5px] text-slate-300 overflow-y-auto custom-scrollbar flex-1">
              {sourcesStatus?.sources?.map((src) => (
                <div key={src.source_id} className="p-1 rounded bg-[#020706] border border-[#668F87]/20">
                  <div className="text-[#D3B34A] font-bold truncate">{src.provider_name}</div>
                  <div className="flex justify-between text-[#71817B]">
                    <span>STATUS: <span className="text-[#39C98A]">{src.status_detail || src.status}</span></span>
                    <span>{src.type}</span>
                  </div>
                  <div className="text-[7.5px] text-[#71817B] truncate">{src.cache_path}</div>
                </div>
              )) || (
                <div className="text-[#71817B]">Loading data sources provenance status...</div>
              )}
            </div>
          </>
        )}

        {/* TAB 7: RESEARCH BENCHMARK STATISTICS */}
        {activeNav === "research" && (
          <>
            <div className="text-[#D3B34A] font-semibold border-b border-[#668F87]/20 pb-1">
              &gt; ESA MISSION-1 RESEARCH BENCHMARK
            </div>
            <div className="flex flex-col gap-1 text-[8.5px] text-slate-300">
              <div className="text-[#71817B] leading-snug">
                Exploratory evaluation of ASTRA Adaptive Event Memory against the anonymized ESA Mission-1 archive.
              </div>

              <div className="grid grid-cols-2 gap-1 mt-0.5 font-bold">
                <div className="p-1 rounded bg-[#020706] border border-[#668F87]/30">
                  <div className="text-[#71817B] text-[7.5px]">GENUINE DETECTION</div>
                  <div className="text-[#39C98A] text-[10.5px]">
                    {researchStats?.end_to_end
                      ? `${researchStats.end_to_end.genuine_anomalies_detected_after_memory} / ${researchStats.end_to_end.labelled_genuine_anomalies} (${researchStats.end_to_end.genuine_anomaly_detection_pct}%)`
                      : "--"}
                  </div>
                </div>

                <div className="p-1 rounded bg-[#020706] border border-[#668F87]/30">
                  <div className="text-[#71817B] text-[7.5px]">RARE ALARM REDUCTION</div>
                  <div className="text-[#D3B34A] text-[10.5px]">
                    {researchStats?.end_to_end
                      ? `${researchStats.end_to_end.rare_event_detector_alarms_before_memory} → ${researchStats.end_to_end.rare_event_detector_alarms_after_memory} (${researchStats.end_to_end.rare_event_detector_alarm_reduction_pct}%)`
                      : "--"}
                  </div>
                </div>

                <div className="p-1 rounded bg-[#020706] border border-[#668F87]/30">
                  <div className="text-[#71817B] text-[7.5px]">ANOMALY SAFETY</div>
                  <div className="text-[#39C98A] text-[10.5px]">
                    {researchStats?.end_to_end
                      ? `${researchStats.end_to_end.genuine_detector_detections_suppressed_by_memory} / ${researchStats.end_to_end.genuine_suppression_denominator} SUPPRESSED`
                      : "--"}
                  </div>
                </div>

                <div className="p-1 rounded bg-[#020706] border border-[#668F87]/30">
                  <div className="text-[#71817B] text-[7.5px]">RECURRENCE RECOGNITION</div>
                  <div className="text-[#F6D365] text-[10.5px]">
                    {researchStats?.memory_stage_recurrence
                      ? `${researchStats.memory_stage_recurrence.subsequently_recognized_windows} / ${researchStats.memory_stage_recurrence.labelled_rare_event_windows} (${researchStats.memory_stage_recurrence.repeated_review_reduction_pct}%)`
                      : "--"}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#668F87]/15 pt-1 mt-0.5 text-[8px] text-[#71817B] leading-snug">
                Scientific Integrity Rule: Zero genuine detector anomaly detections (0/25) were suppressed by memory matching. Evaluated on 65 labelled windows across channels 41 to 46.
              </div>
            </div>
          </>
        )}

      </div>
    </aside>
  );
}

export default LeftInspectorPanel;
