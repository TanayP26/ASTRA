/**
 * ASTRA Space Operations Intelligence Platform - Core Backend API Client
 * Connects Frontend 2.0 to FastAPI backend services.
 */

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

export interface PropagatedSatelliteState {
  norad_id: number;
  cospar_id?: string | null;
  name: string;
  type: string;
  regime: string;
  lat: number;
  lon: number;
  alt_km: number;
  vel_kms: number;
  age_h?: number;
}

export interface GlobalStatesResponse {
  timestamp: string;
  count: number;
  provider: string;
  total_catalog_objects: number;
  cache_age_seconds: number;
  is_offline: boolean;
  states: PropagatedSatelliteState[];
}

export interface SourceValues {
  provider: string;
  element_epoch: string | null;
  inclination_deg: number | null;
  eccentricity: number | null;
  mean_motion: number | null;
  raan_deg: number | null;
  arg_perigee_deg: number | null;
  bstar: number | null;
}

export interface DerivedPropagatedValues {
  propagated_timestamp: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude_km: number | null;
  velocity_kms: number | null;
  element_age_hours: number | null;
  period_minutes: number | null;
  apogee_km: number | null;
  perigee_km: number | null;
  semi_major_axis_km: number | null;
  source_provenance: string;
}

export interface GroundContactPass {
  station_name: string;
  station_lat: number;
  station_lon: number;
  station_alt_km: number;
  current_time_utc: string;
  is_visible: boolean;
  azimuth_deg: number;
  elevation_deg: number;
  range_km: number;
  max_elevation_deg: number | null;
  aos_utc: string | null;
  los_utc: string | null;
  pass_duration_minutes: number | null;
}

export interface ObjectDetailResponse {
  norad_id: number;
  name: string;
  cospar_id: string;
  object_type: string;
  orbit_regime: string;
  source_values: SourceValues;
  derived_propagated_values: DerivedPropagatedValues;
  orbit_path: Array<{ lat: number; lon: number; alt_km: number }>;
  ground_contact: GroundContactPass | null;
  network_and_cache_state: Record<string, any>;
  satnogs_data: Record<string, any>;
}

export interface CurrentAlertResponse {
  status: string; // "NOMINAL" | "KNOWN_OPERATIONAL_PATTERN" | "UNKNOWN_UNUSUAL_EVENT" | "CRITICAL_COMPONENT_ANOMALY"
  severity: "INFO" | "WARNING" | "CRITICAL";
  event_id?: string;
  category?: string;
  class?: string;
  unusualness_score: number;
  classification: string;
  affected_channels: string[];
  top_contributing_channels: string[];
  recent_tc_count_5m: number;
  nearest_pattern?: {
    memory_id: string;
    source_event_id: string;
    operator_label: string;
  } | null;
  similarity_score: number;
  explanation: string;
  recommended_action: string;
}

export interface MemoryRecord {
  memory_id: string;
  source_event_id: string;
  event_timestamp: string;
  operator_label: string;
  affected_channels: string[];
  creation_timestamp: string;
}

export interface MemoryBankResponse {
  count: number;
  memories: MemoryRecord[];
}

export interface SourceProvenanceItem {
  source_id: string;
  provider_name: string;
  data_scope: string;
  type: string;
  status: string;
  status_detail: string;
  http_status: string;
  objects_retrieved: any;
  objects_loaded: any;
  objects_skipped_by_limit: any;
  objects_invalid: any;
  objects_accepted: any;
  objects_rejected: any;
  cache_path: string;
  refresh_duration_ms: number | null;
  last_success: string | null;
  last_attempt: string | null;
  age_seconds: number | null;
  coverage: string;
  records_count: any;
  error_state: string | null;
}

export interface SourcesStatusResponse {
  sources: SourceProvenanceItem[];
}

export interface StatisticsResponse {
  evaluation_name: string;
  evaluation_caveat: string;
  end_to_end: {
    labelled_genuine_anomalies: number;
    genuine_anomalies_detected_before_memory: number;
    genuine_anomalies_detected_after_memory: number;
    genuine_anomaly_detection_pct: number;
    labelled_rare_event_windows: number;
    rare_event_detector_alarms_before_memory: number;
    rare_event_detector_alarms_after_memory: number;
    rare_event_detector_alarm_reduction_pct: number;
    genuine_detector_detections_suppressed_by_memory: number;
    genuine_suppression_denominator: number;
    similarity_threshold: number;
  };
  memory_stage_recurrence: {
    evaluation_type: string;
    labelled_rare_event_windows: number;
    subsequently_recognized_windows: number;
    review_required_windows: number;
    repeated_review_reduction_pct: number;
    similarity_threshold: number;
  };
}

class AstraApiClient {
  private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const targetUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(targetUrl, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...options?.headers,
        },
        ...options,
        signal: options?.signal ?? controller.signal,
      });

      if (!res.ok) {
        throw new Error(`API Error ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  // 1. Global SGP4 Orbital States
  async getGlobalStates(recentRfOnly = false): Promise<GlobalStatesResponse> {
    const query = recentRfOnly ? "?recent_rf_only=true" : "";
    return this.fetchJson<GlobalStatesResponse>(`/api/v1/global/states${query}`);
  }

  // 2. Global Catalog List
  async getGlobalCatalog(query?: string, regime?: string, objectType?: string) {
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (regime) params.append("regime", regime);
    if (objectType) params.append("object_type", objectType);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.fetchJson<any>(`/api/v1/global/catalog${qs}`);
  }

  // 3. Object Inspection Detail
  async getObjectDetail(noradId: number): Promise<ObjectDetailResponse> {
    return this.fetchJson<ObjectDetailResponse>(`/api/v1/global/object/${noradId}`);
  }

  // 4. SatNOGS RF Observations
  async getObjectObservations(noradId: number) {
    return this.fetchJson<any>(`/api/v1/global/object/${noradId}/observations`);
  }

  // 5. Current Alert & Adaptive Event Memory Query
  async getCurrentAlert(): Promise<CurrentAlertResponse> {
    return this.fetchJson<CurrentAlertResponse>("/api/alerts/current");
  }

  // 6. Telemetry Waveforms for Current Research Context
  async getTelemetry() {
    return this.fetchJson<{
      scenario: string;
      category: string;
      telemetry_charts: Record<string, Array<{ timestamp: string; value: number }>>;
    }>("/api/telemetry");
  }

  // 7. Event Timeline
  async getEvents() {
    return this.fetchJson<{
      events: Array<{ id: string; timestamp: string; category: string; description: string }>;
    }>("/api/events");
  }

  // 8. Memory Bank
  async getMemory(): Promise<MemoryBankResponse> {
    return this.fetchJson<MemoryBankResponse>("/api/memory");
  }

  // Human-in-the-Loop Operator Feedback
  async postFeedback(scenarioName: string, operatorLabel: "VALID_OPERATION" | "CONFIRMED_ANOMALY") {
    return this.fetchJson<any>("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ scenario_name: scenarioName, operator_label: operatorLabel }),
    });
  }

  // Data Sources Provenance Status
  async getSourcesStatus(): Promise<SourcesStatusResponse> {
    return this.fetchJson<SourcesStatusResponse>("/api/v1/sources/status");
  }

  // Research Statistics
  async getStatistics(): Promise<StatisticsResponse> {
    return this.fetchJson<StatisticsResponse>("/api/statistics");
  }

  // Authorized Fleet Status
  async getFleet() {
    return this.fetchJson<{
      authorized_count: number;
      spacecraft: any[];
      status_message: string;
      detail: string;
    }>("/api/v1/fleet");
  }

  // Spacecraft Telemetry Channels
  async getSpacecraftOverview(spacecraftId = "ESA_MISSION_1") {
    return this.fetchJson<any>(`/api/v1/spacecraft/${spacecraftId}/overview`);
  }
}

export const astraApi = new AstraApiClient();
export default astraApi;
