"""ASTRA Mission Control Backend API (FastAPI)."""

import asyncio
import contextlib
import json
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from astra.domain import ObjectType, OrbitRegime
from astra.features.event_signature import EventSignature
from astra.memory.event_memory import AdaptiveEventMemory
from astra.sources import (
    CelesTrakProvider,
    OrbitCatalogProvider,
    OrbitPropagationEngine,
    OrbitStateStore,
    PassCalculator,
    SatnogsObservationProvider,
    SatNOGSProvider,
    SGP4Propagator,
)

# Paths
DEMO_SCENARIOS_PATH = Path("configs/demo_scenarios.json")
AUDIT_REPORT_PATH = Path("reports/astra_integrity_audit.md")
ABLATION_REPORT_PATH = Path("reports/astra_context_ablation.md")
RESEARCH_METRICS_PATH = Path("configs/research_metrics.json")

# Global Catalog Provider & State Store Instances
catalog_provider = OrbitCatalogProvider()
satnogs_provider = SatnogsObservationProvider()
orbit_store = OrbitStateStore(catalog_provider, cache_cadence_seconds=3.0)


# Background Tasks & FastAPI Lifespan
async def background_catalog_refresh_loop():
    """Background service for periodic catalog refresh following upstream provider policy."""
    while True:
        with contextlib.suppress(Exception):
            catalog_provider.fetch_online_catalog(group="active")
        await asyncio.sleep(7200)


async def background_propagation_loop():
    """Background service updating cached full-catalog state vectors at a practical cadence."""
    while True:
        with contextlib.suppress(Exception):
            orbit_store.update_snapshot(force=True)
        await asyncio.sleep(3.0)


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    task_catalog = asyncio.create_task(background_catalog_refresh_loop())
    task_prop = asyncio.create_task(background_propagation_loop())
    yield
    task_catalog.cancel()
    task_prop.cancel()


# FastAPI App Initialization (Single Instance)
app = FastAPI(
    title="ASTRA Mission Control Backend",
    description="Spacecraft telemetry health intelligence platform backed by Adaptive Event Memory.",
    version="1.0.0",
    lifespan=lifespan,
)

cors_env = os.getenv("ASTRA_CORS_ORIGINS", "*").strip()
cors_origins = (
    ["*"]
    if cors_env == "*"
    else [origin.strip().rstrip("/") for origin in cors_env.split(",") if origin.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global State
class StateManager:
    def __init__(self):
        self.memory = AdaptiveEventMemory(similarity_threshold=0.80, db_path=":memory:")
        self.current_scenario_name: str = "normal"
        self.scenarios_data: dict[str, Any] = {}
        self.load_scenarios()

    def load_scenarios(self):
        if DEMO_SCENARIOS_PATH.exists():
            with open(DEMO_SCENARIOS_PATH, encoding="utf-8") as f:
                self.scenarios_data = json.load(f)
        else:
            self.scenarios_data = {}

    def reset(self):
        self.memory.clear()
        self.current_scenario_name = "normal"


state = StateManager()


# Request Models
class FeedbackRequest(BaseModel):
    scenario_name: str = Field(..., description="Scenario name being validated (e.g. rare_first, rare_repeat)")
    operator_label: Literal["VALID_OPERATION", "CONFIRMED_ANOMALY"] = Field(
        ..., description="Operator feedback decision"
    )


# Response Models
class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse)
def get_health():
    return {"status": "ok", "service": "ASTRA Mission Control Backend"}


frontend_public_url = os.getenv("ASTRA_FRONTEND_URL", "").strip().rstrip("/")
if frontend_public_url:

    @app.get("/", include_in_schema=False)
    def redirect_to_frontend():
        """Send visitors on the backend domain to the official deployed ASTRA interface."""
        return RedirectResponse(frontend_public_url, status_code=307)


@app.get("/api/mission/summary")
def get_mission_summary():
    sc_data = state.scenarios_data.get(state.current_scenario_name, {})
    memories = state.memory.list_memories()

    return {
        "spacecraft": "ESA Mission-1 Satellite",
        "operational_state": sc_data.get("category", "Nominal"),
        "active_channels": ["channel_41", "channel_42", "channel_43", "channel_44", "channel_45", "channel_46"],
        "total_monitored_channels": 6,
        "current_scenario": state.current_scenario_name,
        "stored_memory_patterns_count": len(memories),
        "detector_status": "ACTIVE_ONLINE",
    }


@app.get("/api/telemetry")
def get_telemetry():
    sc_data = state.scenarios_data.get(state.current_scenario_name, {})
    return {
        "scenario": state.current_scenario_name,
        "category": sc_data.get("category", "Nominal"),
        "telemetry_charts": sc_data.get("telemetry_charts", {}),
    }


@app.get("/api/events")
def get_events():
    memories = state.memory.list_memories()

    timeline = [
        {
            "id": "evt_norm_01",
            "timestamp": "2026-09-01T08:00:00Z",
            "category": "Nominal",
            "description": "Routine nominal orbit passing & telemetry collection",
        }
    ]

    for mem in memories:
        timeline.append(
            {
                "id": mem.memory_id,
                "timestamp": mem.event_timestamp,
                "category": "Validated Operational Pattern",
                "description": f"Operator validated maneuver ({mem.source_event_id})",
            }
        )

    sc_data = state.scenarios_data.get(state.current_scenario_name, {})
    if state.current_scenario_name != "normal":
        timeline.append(
            {
                "id": sc_data.get("event_id", "current_evt"),
                "timestamp": sc_data.get("start_timestamp", ""),
                "category": sc_data.get("category", "Unusual"),
                "description": f"Active event evaluation ({sc_data.get('class', '')})",
            }
        )

    return {"events": timeline}


@app.get("/api/alerts/current")
def get_current_alert():
    sc_name = state.current_scenario_name
    sc_data = state.scenarios_data.get(sc_name, {})

    if sc_name == "normal" or not sc_data:
        return {
            "status": "NOMINAL",
            "severity": "INFO",
            "event_id": "normal_window",
            "category": "Nominal",
            "unusualness_score": 0.42,
            "classification": "NOMINAL_TELEMETRY",
            "affected_channels": [],
            "top_contributing_channels": [],
            "recent_tc_count_5m": 0,
            "nearest_pattern": None,
            "similarity_score": 0.0,
            "explanation": "Spacecraft telemetry operating within nominal 3-sigma bounds.",
            "recommended_action": "Continue routine telemetry monitoring.",
        }

    # Reconstruct EventSignature object for real memory querying
    sig_dict = sc_data["signature"]
    sig = EventSignature.from_dict(sig_dict)

    # Query real Adaptive Event Memory algorithm
    match = state.memory.query(sig)

    raw_score = float(sc_data.get("anomaly_score", 3.0))

    if match.classification == "KNOWN_OPERATIONAL_PATTERN":
        status = "KNOWN_OPERATIONAL_PATTERN"
        severity = "INFO"
        explanation = (
            f"ASTRA matched learned pattern '{match.matched_memory_id}' with "
            f"{match.best_similarity*100:.1f}% similarity to an operator-validated operational pattern."
        )
        rec = "Review with mission policy; operator oversight remains in control."
    else:
        if sc_data.get("category") == "Anomaly":
            status = "CRITICAL_COMPONENT_ANOMALY"
            severity = "CRITICAL"
            rec = "Immediate investigation required. Inspect affected channels."
        else:
            status = "UNKNOWN_UNUSUAL_EVENT"
            severity = "WARNING"
            rec = "Operator review required. Verify if maneuver is valid operation."

        explanation = match.explanation

    nearest_info = None
    if match.nearest_memory:
        nearest_info = {
            "memory_id": match.nearest_memory.memory_id,
            "source_event_id": match.nearest_memory.source_event_id,
            "operator_label": match.nearest_memory.operator_label,
        }

    return {
        "status": status,
        "severity": severity,
        "event_id": sc_data.get("event_id"),
        "category": sc_data.get("category"),
        "class": sc_data.get("class"),
        "unusualness_score": raw_score,
        "classification": match.classification,
        "affected_channels": sc_data.get("affected_channels", []),
        "top_contributing_channels": sc_data.get("affected_channels", [])[:3],
        "recent_tc_count_5m": sig.context_features.get("tc_count_5m", 0),
        "nearest_pattern": nearest_info,
        "similarity_score": float(match.best_similarity),
        "explanation": explanation,
        "recommended_action": rec,
    }


@app.get("/api/memory")
def get_memory():
    memories = state.memory.list_memories(label_filter=None)
    records = []
    for m in memories:
        records.append(
            {
                "memory_id": m.memory_id,
                "source_event_id": m.source_event_id,
                "event_timestamp": m.event_timestamp,
                "operator_label": m.operator_label,
                "affected_channels": m.affected_channels,
                "creation_timestamp": m.creation_timestamp,
            }
        )
    return {"count": len(records), "memories": records}


@app.get("/api/statistics")
def get_statistics():
    """Return version-controlled summaries produced from the reproduced research studies."""
    if not RESEARCH_METRICS_PATH.exists():
        raise HTTPException(status_code=503, detail="Research metrics artifact is unavailable.")
    with open(RESEARCH_METRICS_PATH, encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/feedback")
def post_feedback(req: FeedbackRequest):
    sc_data = state.scenarios_data.get(req.scenario_name)
    if not sc_data:
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_name}' not found.")

    sig_dict = sc_data["signature"]
    sig = EventSignature.from_dict(sig_dict)

    rec = state.memory.store_memory(sig, operator_label=req.operator_label)

    return {
        "message": f"Operational pattern learned and stored in Adaptive Event Memory ({req.operator_label}).",
        "memory_id": rec.memory_id,
        "source_event_id": rec.source_event_id,
        "operator_label": rec.operator_label,
    }


@app.post("/api/demo/reset")
def post_demo_reset():
    state.reset()
    return {"message": "Demo state and Adaptive Event Memory cleared. Scenario reset to normal.", "scenario": "normal"}


@app.post("/api/demo/scenario/{scenario_name}")
def post_demo_scenario(scenario_name: str):
    if scenario_name not in {"normal", "rare_first", "rare_repeat", "anomaly"}:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scenario '{scenario_name}'. Supported: normal, rare_first, rare_repeat, anomaly",
        )

    state.current_scenario_name = scenario_name
    return {
        "message": f"Switched to scenario '{scenario_name}'.",
        "scenario": scenario_name,
        "scenarios_available": list(state.scenarios_data.keys()),
    }


# Live Orbit Providers Initialization
celestrak_provider = CelesTrakProvider()
satnogs_provider = SatNOGSProvider()


@app.get("/api/orbit/satellites")
def get_orbit_satellites():
    return {
        "satellites": celestrak_provider.satellites,
        "ground_station": celestrak_provider.ground_station,
        "cache_ttl_seconds": celestrak_provider.cache_ttl,
    }


@app.get("/api/orbit/state/{norad_id}")
def get_orbit_state(norad_id: int):
    elements, is_offline = celestrak_provider.get_orbital_elements(norad_id)
    if not elements:
        raise HTTPException(status_code=404, detail=f"Satellite NORAD ID {norad_id} not found.")

    propagator = SGP4Propagator(elements)
    now_dt = datetime.now(UTC)
    current_state = propagator.propagate(now_dt)
    element_age_hours = propagator.get_element_age_hours(now_dt)

    ground_tracks = propagator.generate_ground_track(now_dt, duration_minutes=45, step_minutes=1)

    pass_calc = PassCalculator(celestrak_provider.ground_station)
    pass_data = pass_calc.get_instantaneous_pass(propagator, now_dt)

    return {
        "norad_id": norad_id,
        "object_name": propagator.object_name,
        "epoch": propagator.epoch_str,
        "element_age_hours": round(element_age_hours, 2),
        "network_status": "OFFLINE (PROPAGATING FROM CACHED ELEMENTS)" if is_offline else "ONLINE (CELESTRAK GP)",
        "propagation_model": "SGP4",
        "current_position": current_state,
        "ground_tracks": ground_tracks,
        "ground_station_pass": pass_data,
        "source_provenance": {
            "orbit_source": "CelesTrak GP (General Perturbations)",
            "propagation_model": "SGP4 (WGS72)",
            "refresh_policy": "Minimum 2-Hour Disk Cache",
            "is_offline_fallback": is_offline,
        },
    }


@app.get("/api/orbit/satnogs/{norad_id}")
def get_satnogs_data(norad_id: int):
    return satnogs_provider.get_satellite_observations(norad_id)


@app.websocket("/ws/orbit/{norad_id}")
async def websocket_orbit(websocket: WebSocket, norad_id: int):
    await websocket.accept()
    obj = catalog_provider.get_object(norad_id)
    if not obj or not obj.elements:
        await websocket.close(code=4004)
        return

    elems = obj.elements
    gp_dict = {
        "NORAD_CAT_ID": elems.norad_id,
        "OBJECT_NAME": elems.name,
        "EPOCH": elems.epoch.isoformat(),
        "INCLINATION": elems.inclination_deg,
        "RA_OF_ASC_NODE": elems.raan_deg,
        "ECCENTRICITY": elems.eccentricity,
        "ARG_OF_PERICENTER": elems.arg_perigee_deg,
        "MEAN_ANOMALY": elems.mean_anomaly_deg,
        "MEAN_MOTION": elems.mean_motion,
        "BSTAR": elems.bstar,
    }
    propagator = SGP4Propagator(gp_dict)
    pass_calc = PassCalculator({
        "name": "ASTRA REFERENCE GROUND STATION",
        "latitude": 17.3850,
        "longitude": 78.4867,
        "altitude_km": 0.545,
        "min_elevation_deg": 5.0,
    })

    try:
        while True:
            now_dt = datetime.now(UTC)
            current_state = propagator.propagate(now_dt)
            element_age_hours = (now_dt - elems.epoch.replace(tzinfo=UTC)).total_seconds() / 3600.0
            pass_data = pass_calc.get_instantaneous_pass(propagator, now_dt)
            orbit_path = OrbitPropagationEngine.calculate_orbit_path(obj, now_dt)

            payload = {
                "norad_id": norad_id,
                "name": obj.name,
                "cospar_id": obj.cospar_id,
                "object_type": obj.object_type.value,
                "orbit_regime": obj.orbit_regime.value,
                "timestamp": now_dt.isoformat(),
                "current_position": current_state,
                "latitude": round(current_state["latitude"], 4),
                "longitude": round(current_state["longitude"], 4),
                "altitude_km": round(current_state["altitude_km"], 2),
                "velocity_km_s": round(current_state["velocity_kms"], 3),
                "element_age_hours": round(element_age_hours, 2),
                "source_state": "OFFLINE (CACHED ELEMENTS)" if catalog_provider.is_offline else "ONLINE (CELESTRAK GP/OMM)",
                "orbit_path": orbit_path,
                "ground_contact": pass_data,
            }
            await websocket.send_json(payload)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close()


# ==================== V1 PRODUCTION API ENDPOINTS ==================== #

@app.get("/api/v1/global/catalog")
def get_global_catalog(
    q: str | None = None,
    regime: OrbitRegime | None = None,
    object_type: ObjectType | None = None,
    authorized_only: bool = False,
    recent_rf_only: bool = False,
):
    """Global Orbital Catalog query endpoint supporting exact-ranked search and verified filters."""
    objects = catalog_provider.list_objects(query=q, regime=regime, obj_type=object_type, authorized_only=authorized_only)
    if recent_rf_only:
        recent_norad_ids = satnogs_provider.get_recent_rf_norad_ids()
        objects = [obj for obj in objects if obj.norad_id in recent_norad_ids]

    summary = catalog_provider.status_summary
    return {
        "count": len(objects),
        "catalog_source": catalog_provider.provider_name,
        "status": summary["status"],
        "is_offline": catalog_provider.is_offline,
        "last_successful_refresh": summary["last_successful_refresh"],
        "cache_age_seconds": summary["cache_age_seconds"],
        "source_epoch": summary["source_epoch"],
        "last_error": summary["last_error"],
        "objects": [obj.model_dump(mode="json") for obj in objects],
    }


@app.get("/api/v1/global/summary")
def get_global_summary():
    """Global Orbital Catalog operational metrics, regime breakdown, and data freshness."""
    all_objects = catalog_provider.list_objects()
    regimes = {"LEO": 0, "MEO": 0, "GEO": 0, "HEO": 0, "OTHER": 0}
    obj_types = {"ACTIVE_SPACECRAFT": 0, "INACTIVE_SPACECRAFT": 0, "ROCKET_BODY": 0, "DEBRIS": 0, "UNKNOWN": 0}

    for obj in all_objects:
        regimes[obj.orbit_regime.value] = regimes.get(obj.orbit_regime.value, 0) + 1
        obj_types[obj.object_type.value] = obj_types.get(obj.object_type.value, 0) + 1

    summary = catalog_provider.status_summary
    return {
        "total_catalog_objects": len(all_objects),
        "active_spacecraft_count": obj_types["ACTIVE_SPACECRAFT"],
        "authorized_telemetry_spacecraft_count": 0,  # Operational fleet count
        "orbit_regimes": regimes,
        "object_types": obj_types,
        "catalog_provider": catalog_provider.provider_name,
        "status": summary["status"],
        "is_offline": catalog_provider.is_offline,
        "last_successful_refresh": summary["last_successful_refresh"],
        "cache_age_seconds": summary["cache_age_seconds"],
        "source_epoch": summary["source_epoch"],
        "propagation_engine": "SGP4 (WGS72) Local Propagation",
    }


@app.get("/api/v1/global/states")
def get_global_states(recent_rf_only: bool = False):
    """Compact vectorized propagated state vectors for scalable 2D/3D visualizers."""
    states = orbit_store.get_all_propagated_states()
    recent_ids = satnogs_provider.get_recent_rf_norad_ids() if recent_rf_only else None
    summary = catalog_provider.status_summary
    compact = []
    for st in states:
        if recent_ids is not None and st.norad_id not in recent_ids:
            continue
        obj = catalog_provider.get_object(st.norad_id)
        compact.append({
            "norad_id": st.norad_id,
            "cospar_id": st.cospar_id or (obj.cospar_id if obj else None),
            "name": st.name,
            "type": st.object_type.value,
            "regime": st.orbit_regime.value,
            "lat": round(st.latitude, 4),
            "lon": round(st.longitude, 4),
            "alt_km": round(st.altitude_km, 1),
            "vel_kms": round(st.velocity_kms, 3),
            "age_h": round(st.element_age_hours, 1),
        })
    return {
        "timestamp": datetime.now(UTC).isoformat(),
        "count": len(compact),
        "provider": summary["provider"],
        "total_catalog_objects": summary["catalog_object_count"],
        "cache_age_seconds": summary["cache_age_seconds"],
        "is_offline": catalog_provider.is_offline,
        "states": compact,
    }


@app.get("/api/v1/global/object/{norad_id}")
def get_global_object_detail(norad_id: int):
    """Detailed object inspection separating SOURCE VALUES from DERIVED / PROPAGATED VALUES."""
    obj = catalog_provider.get_object(norad_id)
    if not obj:
        raise HTTPException(status_code=404, detail=f"Catalog Object NORAD ID {norad_id} not found.")

    state_data = orbit_store.get_propagated_state(norad_id)
    derived = OrbitPropagationEngine.calculate_derived_metrics(obj.elements) if obj.elements else {}
    orbit_path = OrbitPropagationEngine.calculate_orbit_path(obj) if obj.elements else []

    ground_contact = None
    if obj.elements:
        gp_dict = {
            "NORAD_CAT_ID": obj.elements.norad_id,
            "OBJECT_NAME": obj.name,
            "EPOCH": obj.elements.epoch.isoformat(),
            "INCLINATION": obj.elements.inclination_deg,
            "RA_OF_ASC_NODE": obj.elements.raan_deg,
            "ECCENTRICITY": obj.elements.eccentricity,
            "ARG_OF_PERICENTER": obj.elements.arg_perigee_deg,
            "MEAN_ANOMALY": obj.elements.mean_anomaly_deg,
            "MEAN_MOTION": obj.elements.mean_motion,
            "BSTAR": obj.elements.bstar,
        }
        propagator = SGP4Propagator(gp_dict)
        pass_calc = PassCalculator({
            "name": "ASTRA REFERENCE GROUND STATION",
            "latitude": 17.3850,
            "longitude": 78.4867,
            "altitude_km": 0.545,
            "min_elevation_deg": 5.0,
        })
        ground_contact = pass_calc.get_instantaneous_pass(propagator, datetime.now(UTC))

    satnogs_data = satnogs_provider.fetch_all(norad_id)

    return {
        "norad_id": obj.norad_id,
        "name": obj.name,
        "cospar_id": obj.cospar_id,
        "object_type": obj.object_type.value,
        "orbit_regime": obj.orbit_regime.value,
        "source_values": {
            "provider": catalog_provider.provider_name,
            "element_epoch": obj.elements.epoch.isoformat() if obj.elements else None,
            "inclination_deg": obj.elements.inclination_deg if obj.elements else None,
            "eccentricity": obj.elements.eccentricity if obj.elements else None,
            "mean_motion": obj.elements.mean_motion if obj.elements else None,
            "raan_deg": obj.elements.raan_deg if obj.elements else None,
            "arg_perigee_deg": obj.elements.arg_perigee_deg if obj.elements else None,
            "bstar": obj.elements.bstar if obj.elements else None,
        },
        "derived_propagated_values": {
            "propagated_timestamp": state_data.propagated_timestamp.isoformat() if state_data else None,
            "latitude": round(state_data.latitude, 4) if state_data else None,
            "longitude": round(state_data.longitude, 4) if state_data else None,
            "altitude_km": round(state_data.altitude_km, 2) if state_data else None,
            "velocity_kms": round(state_data.velocity_kms, 3) if state_data else None,
            "element_age_hours": round(state_data.element_age_hours, 2) if state_data else None,
            "period_minutes": derived.get("period_minutes"),
            "apogee_km": derived.get("apogee_km"),
            "perigee_km": derived.get("perigee_km"),
            "semi_major_axis_km": derived.get("semi_major_axis_km"),
            "source_provenance": "SGP4 (WGS72) Local Propagation Engine",
        },
        "orbit_path": orbit_path,
        "ground_contact": ground_contact,
        "network_and_cache_state": catalog_provider.status_summary,
        "satnogs_data": satnogs_data,
    }


@app.get("/api/v1/global/object/{norad_id}/observations")
def get_object_observations(norad_id: int):
    """SatNOGS live RF observation data endpoint for a given NORAD ID."""
    return satnogs_provider.get_observations(norad_id)


@app.get("/api/v1/global/object/{norad_id}/telemetry")
def get_object_telemetry(norad_id: int):
    """SatNOGS public telemetry frame endpoint with dynamic decoder key-values."""
    return satnogs_provider.get_telemetry(norad_id)


@app.get("/api/v1/global/object/{norad_id}/data-availability")
def get_object_data_availability(norad_id: int):
    """Explicit SatNOGS RF observation and telemetry availability status."""
    return satnogs_provider.get_data_availability(norad_id)


@app.get("/api/v1/fleet")
def get_authorized_fleet():
    """Returns spacecraft for which ASTRA has mission-level health intelligence authorization."""
    return {
        "authorized_count": 0,
        "spacecraft": [],
        "status_message": "NO AUTHORIZED FLEET CONNECTED",
        "detail": "ASTRA is operating in Global Orbital Awareness and Research Validation mode. No production spacecraft telemetry stream is currently connected.",
    }


@app.get("/api/v1/spacecraft/{spacecraft_id}/overview")
def get_spacecraft_overview(spacecraft_id: str):
    """Overview endpoint for authorized spacecraft telemetry parameters."""
    if spacecraft_id in {"ESA_MISSION_1", "ESA-MISSION-1"}:
        return {
            "spacecraft_id": "ESA_MISSION_1",
            "name": "ESA Mission-1 Satellite (Research Dataset)",
            "data_context": "HISTORICAL_RESEARCH_DATA",
            "agency": "European Space Agency (ESA)",
            "mission_description": "ESA ADB Spacecraft Health Intelligence & Anomaly Intelligence Benchmark.",
            "telemetry_stream_status": "HISTORICAL_RESEARCH_DATA",
            "parameters": [
                {
                    "parameter_id": f"channel_{channel}",
                    "name": f"CH_{channel}",
                    "unit": "N/A",
                    "subsystem": "Anonymized research telemetry channel",
                }
                for channel in range(41, 47)
            ],
        }

    raise HTTPException(
        status_code=404,
        detail=f"Spacecraft '{spacecraft_id}' has NO TELEMETRY SOURCE or is RESTRICTED.",
    )


# ==================== V1 RESEARCH / VALIDATION ENDPOINTS ==================== #

@app.get("/api/v1/research/overview")
def get_research_overview():
    """ESA Mission-1 Historical Research Dataset overview and Adaptive Event Memory benchmark metrics."""
    memories = state.memory.list_memories()
    return {
        "dataset_name": "ESA ADB Mission-1 Telemetry Archive",
        "data_context": "HISTORICAL_RESEARCH_DATA",
        "agency": "European Space Agency (ESA)",
        "labelled_events_count": 65,
        "monitored_channels_count": 6,
        "current_scenario": state.current_scenario_name,
        "stored_memory_patterns_count": len(memories),
        **get_statistics(),
    }


RESEARCH_DATA_DIR = Path("data/processed/mission1")


def research_source_status() -> dict[str, Any]:
    """Describe local research asset availability without claiming absent data exists."""
    required_paths = [
        RESEARCH_DATA_DIR / "events.parquet",
        RESEARCH_DATA_DIR / "telecommands.parquet",
        *(RESEARCH_DATA_DIR / "channels" / f"channel_{n}.parquet" for n in range(41, 47)),
    ]
    if all(path.exists() for path in required_paths):
        status = "HISTORICAL RESEARCH ARCHIVE AVAILABLE"
        source_type = "HISTORICAL RESEARCH DATA"
        available_path = str(RESEARCH_DATA_DIR)
    elif DEMO_SCENARIOS_PATH.exists():
        status = "PREPARED RESEARCH SCENARIOS AVAILABLE"
        source_type = "HISTORICAL / PREPARED ARTIFACT"
        available_path = str(DEMO_SCENARIOS_PATH)
    else:
        status = "RESEARCH DATA NOT BUNDLED"
        source_type = "HISTORICAL / NOT BUNDLED"
        available_path = "N/A"
    return {
        "source_id": "esa_mission1_archive",
        "provider_name": "ESA Mission-1 Anonymized Telemetry Dataset",
        "data_scope": "RESEARCH_VALIDATION_DATA",
        "type": source_type,
        "status": status,
        "status_detail": status,
        "http_status": "N/A",
        "objects_retrieved": "N/A",
        "objects_loaded": "N/A",
        "objects_accepted": "N/A",
        "objects_rejected": "N/A",
        "objects_skipped_by_limit": "N/A",
        "objects_invalid": "N/A",
        "cache_path": available_path,
        "refresh_duration_ms": None,
        "last_success": None,
        "last_attempt": None,
        "age_seconds": None,
        "coverage": "Historical anonymized research assets; availability is checked locally",
        "records_count": "N/A",
        "error_state": None if available_path != "N/A" else "Research assets are not bundled.",
    }


@app.get("/api/version")
def get_version():
    """Return deployment identity when supplied by Railway."""
    return {"commit": os.getenv("RAILWAY_GIT_COMMIT_SHA") or "local/unknown"}


@app.get("/api/v1/sources/status")
def get_data_sources_status():
    """Comprehensive data source operational view, freshness, and error states."""
    cat_summary = catalog_provider.status_summary
    # Loaded per-object cache state does not establish provider-wide health metrics.
    cached_entries = list(satnogs_provider._memory_cache.values())
    satnogs_status = (
        "USING CACHED DATA"
        if any(entry.get("source_status") in {
            "LIVE_ONLINE", "USING CACHED SATNOGS DATA"
        } for entry in cached_entries)
        else "SOURCE UNAVAILABLE"
    )
    return {
        "sources": [
            {
                "source_id": "orbital_catalog_celestrak",
                "provider_name": "CelesTrak GP/OMM Catalog Ingestion Engine",
                "data_scope": "GLOBAL_ORBITAL_AWARENESS",
                "type": "CURRENT / NEAR-REAL-TIME",
                "status": "OFFLINE" if cat_summary["is_offline"] else "ONLINE",
                "status_detail": "USING CACHED ELEMENTS" if cat_summary["is_offline"] else "LIVE ONLINE (OMM/GP)",
                "http_status": cat_summary.get("http_status", "200 OK"),
                "objects_retrieved": cat_summary.get("objects_retrieved", 0),
                "objects_loaded": cat_summary.get("objects_loaded", 0),
                "objects_skipped_by_limit": cat_summary.get("objects_skipped_by_limit", 0),
                "objects_invalid": cat_summary.get("objects_invalid", 0),
                "objects_accepted": cat_summary.get("objects_accepted", 0),
                "objects_rejected": cat_summary.get("objects_rejected", 0),
                "cache_path": cat_summary.get("cache_path", "data/cache/celestrak_active_catalog.json"),
                "refresh_duration_ms": cat_summary.get("refresh_duration_ms", 0.0),
                "last_success": cat_summary["last_successful_refresh"],
                "last_attempt": cat_summary["last_attempt_timestamp"],
                "age_seconds": cat_summary["cache_age_seconds"],
                "coverage": f"{cat_summary['catalog_object_count']} Public Trackable Space Objects",
                "records_count": cat_summary["catalog_object_count"],
                "error_state": cat_summary["last_error"],
            },
            {
                "source_id": "satnogs_ground_station",
                "provider_name": "SatNOGS Public Ground Station Network",
                "data_scope": "GLOBAL_ORBITAL_AWARENESS",
                "type": "NEAR-REAL-TIME COMMUNITY OBSERVATIONS",
                "status": satnogs_status,
                "status_detail": satnogs_status,
                "http_status": "N/A",
                "objects_retrieved": "N/A",
                "objects_loaded": "N/A",
                "objects_skipped_by_limit": "N/A",
                "objects_invalid": "N/A",
                "objects_accepted": "N/A",
                "objects_rejected": "N/A",
                "cache_path": str(satnogs_provider.cache_dir),
                "refresh_duration_ms": None,
                "last_success": None,
                "last_attempt": None,
                "age_seconds": None,
                "coverage": "Public community RF observations; provider-wide health unavailable",
                "records_count": "N/A",
                "error_state": None,
            },
            research_source_status(),
            {
                "source_id": "production_fleet_telemetry",
                "provider_name": "Authorized Production Fleet Telemetry Stream",
                "data_scope": "AUTHORIZED_FLEET_OPERATIONS",
                "type": "NOT CONFIGURED",
                "status": "NOT_CONFIGURED",
                "status_detail": "NO AUTHORIZED FLEET CONNECTED",
                "http_status": "DISCONNECTED",
                "objects_retrieved": 0,
                "objects_accepted": 0,
                "objects_rejected": 0,
                "cache_path": "N/A",
                "refresh_duration_ms": 0.0,
                "last_success": None,
                "last_attempt": None,
                "age_seconds": -1.0,
                "coverage": "0 Spacecraft Connected",
                "records_count": 0,
                "error_state": "No production telemetry provider endpoint configured.",
            },
        ]
    }


class SafeStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        shell_asset = path in {".", "", "index.html", "app.js", "styles.css"}
        if shell_asset:
            # A stale browser validator must not turn a new shell response into a 304.
            scope = {**scope, "headers": [
                (name, value) for name, value in scope.get("headers", [])
                if name.lower() not in {b"if-none-match", b"if-modified-since"}
            ]}
        response = await super().get_response(path, scope)
        if shell_asset:
            response.headers["Cache-Control"] = "no-store, max-age=0"
        return response

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return
        await super().__call__(scope, receive, send)


# Mount Frontend Static Assets AT THE VERY END
frontend_dir = Path("app/frontend")
if frontend_dir.exists():
    app.mount("/", SafeStaticFiles(directory=str(frontend_dir), html=True), name="frontend")



