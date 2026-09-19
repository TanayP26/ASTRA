"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import TacticalHeader from "@/components/TacticalHeader";
import LeftInspectorPanel from "@/components/LeftInspectorPanel";
import TacticalOrbitalGlobe from "@/components/TacticalOrbitalGlobe";
import RightBriefingPanel from "@/components/RightBriefingPanel";
import StatusBar from "@/components/StatusBar";
import {
  astraApi,
  PropagatedSatelliteState,
  ObjectDetailResponse,
  CurrentAlertResponse,
  MemoryBankResponse,
  SourcesStatusResponse,
  StatisticsResponse,
} from "@/services/astraApi";

function toWsUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

function getWsBase(): string {
  const explicitWs = process.env.NEXT_PUBLIC_WS_URL;
  if (explicitWs) {
    return toWsUrl(explicitWs);
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiBase) {
    return toWsUrl(apiBase);
  }

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    return "ws://127.0.0.1:8050";
  }

  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  return typeof window !== "undefined" ? `${protocol}//${window.location.host}` : "ws://127.0.0.1:8050";
}

export default function Home() {
  const [activeNav, setActiveNav] = useState<string>("global");
  const [selectedNoradId, setSelectedNoradId] = useState<number>(25544); // Default to ISS (ZARYA)
  const [spacecraftStates, setSpacecraftStates] = useState<PropagatedSatelliteState[]>([]);
  const [objectDetail, setObjectDetail] = useState<ObjectDetailResponse | null>(null);

  // Operational State
  const currentScenario = "normal";
  const [currentAlert, setCurrentAlert] = useState<CurrentAlertResponse | null>(null);
  const [memoryBank, setMemoryBank] = useState<MemoryBankResponse | null>(null);
  const [sourcesStatus, setSourcesStatus] = useState<SourcesStatusResponse | null>(null);
  const [researchStats, setResearchStats] = useState<StatisticsResponse | null>(null);
  const [fleetStatus, setFleetStatus] = useState<any>(null);
  const [spacecraftOverview, setSpacecraftOverview] = useState<any>(null);

  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);

  // 1. Initial Load: Fetch Global Catalog States, Alerts, Memory, Sources, and Research
  const fetchAllData = useCallback(async () => {
    try {
      const [statesRes, alertRes, memRes, srcRes, statRes, fltRes, scRes] = await Promise.allSettled([
        astraApi.getGlobalStates(),
        astraApi.getCurrentAlert(),
        astraApi.getMemory(),
        astraApi.getSourcesStatus(),
        astraApi.getStatistics(),
        astraApi.getFleet(),
        astraApi.getSpacecraftOverview(),
      ]);

      if (statesRes.status === "fulfilled" && statesRes.value?.states) {
        setSpacecraftStates(statesRes.value.states);
        setIsBackendConnected(true);
      } else if (statesRes.status === "rejected") {
        setIsBackendConnected(false);
      }

      if (alertRes.status === "fulfilled") setCurrentAlert(alertRes.value);
      if (memRes.status === "fulfilled") setMemoryBank(memRes.value);
      if (srcRes.status === "fulfilled") setSourcesStatus(srcRes.value);
      if (statRes.status === "fulfilled") setResearchStats(statRes.value);
      if (fltRes.status === "fulfilled") setFleetStatus(fltRes.value);
      if (scRes.status === "fulfilled") setSpacecraftOverview(scRes.value);
    } catch {
      setIsBackendConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    // 2-second polling for backend-propagated SGP4 state updates
    const interval = setInterval(async () => {
      try {
        const statesData = await astraApi.getGlobalStates();
        if (statesData?.states) {
          setSpacecraftStates(statesData.states);
          setIsBackendConnected(true);
        }
      } catch {
        setIsBackendConnected(false);
      }
    }, 2000);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        fetchAllData();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchAllData]);

  // 2. Fetch selected-object detail and keep the 1 Hz WebSocket resilient to deploy cold starts.
  useEffect(() => {
    let isCancelled = false;
    let detailRetry: ReturnType<typeof setTimeout> | null = null;
    let wsRetry: ReturnType<typeof setTimeout> | null = null;
    let wsAttempts = 0;

    const fetchDetail = async () => {
      try {
        const detail = await astraApi.getObjectDetail(selectedNoradId);
        if (!isCancelled) setObjectDetail(detail);
      } catch {
        if (!isCancelled) {
          setObjectDetail(null);
          detailRetry = setTimeout(fetchDetail, 3000);
        }
      }
    };

    const connectWs = () => {
      if (isCancelled) return;

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      try {
        const wsUrl = `${getWsBase()}/ws/orbit/${selectedNoradId}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          wsAttempts = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.norad_id === selectedNoradId) {
              setObjectDetail((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  derived_propagated_values: {
                    ...prev.derived_propagated_values,
                    latitude: data.latitude ?? prev.derived_propagated_values.latitude,
                    longitude: data.longitude ?? prev.derived_propagated_values.longitude,
                    altitude_km: data.altitude_km ?? prev.derived_propagated_values.altitude_km,
                    velocity_kms: data.velocity_km_s ?? prev.derived_propagated_values.velocity_kms,
                    propagated_timestamp: data.timestamp ?? prev.derived_propagated_values.propagated_timestamp,
                    element_age_hours: data.element_age_hours ?? prev.derived_propagated_values.element_age_hours,
                  },
                  ground_contact: data.ground_contact ?? prev.ground_contact,
                  orbit_path: data.orbit_path?.length ? data.orbit_path : prev.orbit_path,
                };
              });
            }
          } catch {
            // Ignore malformed frames and retain the latest valid state.
          }
        };

        ws.onerror = () => {
          ws.close();
        };

        ws.onclose = () => {
          if (isCancelled) return;
          wsAttempts += 1;
          const delay = Math.min(8000, 1000 * 2 ** Math.min(wsAttempts, 3));
          wsRetry = setTimeout(connectWs, delay);
        };
      } catch {
        if (!isCancelled) {
          wsAttempts += 1;
          const delay = Math.min(8000, 1000 * 2 ** Math.min(wsAttempts, 3));
          wsRetry = setTimeout(connectWs, delay);
        }
      }
    };

    void fetchDetail();
    connectWs();

    return () => {
      isCancelled = true;
      if (detailRetry) clearTimeout(detailRetry);
      if (wsRetry) clearTimeout(wsRetry);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selectedNoradId]);

  // 5. Human-in-the-Loop Operator Feedback Action (Strict Async Semantics)
  const handleOperatorFeedback = async (label: "VALID_OPERATION" | "CONFIRMED_ANOMALY") => {
    setIsProcessingAction(true);
    try {
      const response = await astraApi.postFeedback(currentScenario, label);
      const [alertData, memData] = await Promise.all([
        astraApi.getCurrentAlert(),
        astraApi.getMemory(),
      ]);
      setCurrentAlert(alertData);
      setMemoryBank(memData);
      return response;
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Satellite target list for Right Briefing Panel dropdown
  const satelliteList = spacecraftStates.length > 0
    ? spacecraftStates.map((s) => ({
        id: s.norad_id,
        name: s.name,
        norad: s.norad_id,
        cospar: s.cospar_id,
        regime: s.regime,
      }))
    : [
        { id: 25544, name: "ISS (ZARYA)", norad: 25544, cospar: "1998-067A", regime: "LEO" },
      ];

  const threatCount =
    currentAlert &&
    (currentAlert.status === "UNKNOWN_UNUSUAL_EVENT" ||
      currentAlert.status === "CRITICAL_COMPONENT_ANOMALY")
      ? 1
      : 0;

  return (
    <div 
      className="astra-shell w-screen h-screen text-[#e2e8f0] flex flex-col overflow-hidden select-none app-background"
      style={{
        backgroundImage: "url('/bg-nebula.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#020706",
      }}
    >
      {/* Primary navigation */}
      <TacticalHeader
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        threatCount={threatCount}
        threatStatus={currentAlert?.status || "NOMINAL"}
      />

      {/* Main operations workspace */}
      <main className="astra-main flex-1 flex overflow-hidden w-full h-full relative">
        {/* Left Column: Fixed Spacecraft Inspector + Dynamic Nav Tab Panel */}
        <LeftInspectorPanel
          activeNav={activeNav}
          selectedNoradId={selectedNoradId}
          objectDetail={objectDetail}
          currentAlert={currentAlert}
          memoryBank={memoryBank}
          sourcesStatus={sourcesStatus}
          researchStats={researchStats}
          fleetStatus={fleetStatus}
          spacecraftOverview={spacecraftOverview}
        />

        {/* Center: orbital visualization */}
        <div className="astra-globe flex-1 h-full relative bg-transparent">
          {!isBackendConnected && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded border border-[#D3B34A]/30 bg-[#020706]/90 text-[#D3B34A] text-[10px] font-semibold tracking-wide"
              role="status"
              aria-live="polite"
            >
              BACKEND RECONNECTING — RETRYING AUTOMATICALLY
            </div>
          )}
          <TacticalOrbitalGlobe
            selectedNoradId={selectedNoradId}
            onSelectNoradId={setSelectedNoradId}
            spacecraftStates={spacecraftStates}
            orbitPath={objectDetail?.orbit_path || []}
            groundContact={objectDetail?.ground_contact || null}
            selectedCoordinates={objectDetail?.derived_propagated_values ? {
              latitude: objectDetail.derived_propagated_values.latitude,
              longitude: objectDetail.derived_propagated_values.longitude,
              altitude_km: objectDetail.derived_propagated_values.altitude_km,
            } : undefined}
          />
        </div>

        {/* Right: object selection, event context and ground contact */}
        <RightBriefingPanel
          selectedNoradId={selectedNoradId}
          onSelectNoradId={setSelectedNoradId}
          satelliteList={satelliteList}
          currentAlert={currentAlert}
          groundContact={objectDetail?.ground_contact || null}
          onOperatorFeedback={handleOperatorFeedback}
          isProcessingAction={isProcessingAction}
        />
      </main>

      {/* Persistent Bottom Status Bar */}
      <StatusBar
        catalogCount={spacecraftStates.length > 0 ? spacecraftStates.length : undefined}
        memoryCount={memoryBank?.count ?? 0}
        alertStatus={currentAlert?.status || "NOMINAL"}
        isBackendConnected={isBackendConnected}
      />
    </div>
  );
}
