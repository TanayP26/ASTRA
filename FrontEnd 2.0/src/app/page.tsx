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

function getWsBase(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
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
  const [activeNav, setActiveNav] = useState<string>("overview");
  const [selectedNoradId, setSelectedNoradId] = useState<number>(25544); // Default to ISS (ZARYA)
  const [spacecraftStates, setSpacecraftStates] = useState<PropagatedSatelliteState[]>([]);
  const [objectDetail, setObjectDetail] = useState<ObjectDetailResponse | null>(null);

  // Operational State
  const [currentScenario, setCurrentScenario] = useState<string>("normal");
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

  // 2. Fetch Selected Satellite Detail whenever selectedNoradId changes
  useEffect(() => {
    let isCancelled = false;
    const fetchDetail = async () => {
      try {
        const detail = await astraApi.getObjectDetail(selectedNoradId);
        if (!isCancelled) setObjectDetail(detail);
      } catch {
        if (!isCancelled) setObjectDetail(null);
      }
    };

    fetchDetail();

    // 3. Connect Live WebSocket for Selected Object (Direct to FastAPI)
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const wsUrl = `${getWsBase()}/ws/orbit/${selectedNoradId}`;
      const ws = new WebSocket(wsUrl);

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
          // Ignored
        }
      };

      ws.onerror = () => {
        // Fallback smooth
      };

      wsRef.current = ws;
    } catch {
      // Ignored
    }

    return () => {
      isCancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selectedNoradId]);

  // 4. Scenario Switching Action
  const handleSelectScenario = async (scenarioName: string) => {
    setIsProcessingAction(true);
    try {
      await astraApi.postScenario(scenarioName);
      setCurrentScenario(scenarioName);
      const [alertData, memData] = await Promise.all([
        astraApi.getCurrentAlert(),
        astraApi.getMemory(),
      ]);
      setCurrentAlert(alertData);
      setMemoryBank(memData);
    } catch (err) {
      console.error("Failed to switch scenario:", err);
    } finally {
      setIsProcessingAction(false);
    }
  };

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

  const handleResetDemo = async () => {
    setIsProcessingAction(true);
    try {
      await astraApi.postReset();
      setCurrentScenario("normal");
      const [alertData, memData] = await Promise.all([
        astraApi.getCurrentAlert(),
        astraApi.getMemory(),
      ]);
      setCurrentAlert(alertData);
      setMemoryBank(memData);
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
      className="w-screen h-screen text-[#e2e8f0] flex flex-col overflow-hidden font-mono select-none app-background"
      style={{
        backgroundImage: "url('/bg-nebula.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#020706",
      }}
    >
      {/* Top Tactical Header */}
      <TacticalHeader
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        threatCount={threatCount}
        threatStatus={currentAlert?.status || "NOMINAL"}
      />

      {/* Main 3-Column Mission Control Workspace */}
      <main className="flex-1 flex overflow-hidden w-full h-full relative">
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
          currentScenario={currentScenario}
          onSelectScenario={handleSelectScenario}
          onOperatorFeedback={handleOperatorFeedback}
          onResetDemo={handleResetDemo}
          isProcessingAction={isProcessingAction}
        />

        {/* Center Column: 3D Tactical Orbital Globe Canvas */}
        <div className="flex-1 h-full relative bg-transparent">
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

        {/* Right Column: Operational Event Briefing, Target Selector & Reference Ground Station Pass */}
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
