#!/usr/bin/env python3
"""Fetch OSM roads / buildings / POIs for Hejing town AOI.

Primary: OSM API 0.6 map export (small bbox).
Fallback: Overpass interpreters.

Uses local HTTP proxy http://127.0.0.1:1087 by default (Privoxy).
  DGGS_PROXY=http://127.0.0.1:1087 python3 scripts/fetch_osm.py
  DGGS_PROXY= python3 scripts/fetch_osm.py   # disable proxy
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VECTOR = ROOT / "vector"
META = json.loads((ROOT / "meta.json").read_text(encoding="utf-8"))
AOI = META["aoi"]
WEST, SOUTH, EAST, NORTH = AOI["west"], AOI["south"], AOI["east"], AOI["north"]
BBOX_OVERPASS = f"{SOUTH},{WEST},{NORTH},{EAST}"
BBOX_OSM = f"{WEST},{SOUTH},{EAST},{NORTH}"

DEFAULT_PROXY = "http://127.0.0.1:1087"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def resolve_proxy() -> str | None:
    if "DGGS_PROXY" in os.environ:
        val = os.environ["DGGS_PROXY"].strip()
        return val or None
    for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        if key in os.environ and os.environ[key].strip():
            return os.environ[key].strip()
    return DEFAULT_PROXY


def build_opener(proxy: str | None) -> urllib.request.OpenerDirector:
    if not proxy:
        return urllib.request.build_opener()
    handler = urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    return urllib.request.build_opener(handler)


def http_get(opener: urllib.request.OpenerDirector, url: str, timeout: int = 180) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "*/*",
            "User-Agent": "DGGS-testdata-hejing/0.1 (local demo)",
        },
        method="GET",
    )
    with opener.open(req, timeout=timeout) as resp:
        return resp.read()


def http_post_form(
    opener: urllib.request.OpenerDirector, url: str, data: dict[str, str], timeout: int = 180
) -> bytes:
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "DGGS-testdata-hejing/0.1 (local demo)",
        },
        method="POST",
    )
    with opener.open(req, timeout=timeout) as resp:
        return resp.read()


def fetch_osm_xml(opener: urllib.request.OpenerDirector) -> Path:
    """Download OSM API map export for AOI."""
    url = f"https://api.openstreetmap.org/api/0.6/map?bbox={BBOX_OSM}"
    print(f"  GET {url}")
    raw = http_get(opener, url, timeout=180)
    out = VECTOR / "_raw" / "map.osm"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    print(f"  saved {out} ({len(raw)} bytes)")
    return out


def parse_osm_xml(osm_path: Path) -> dict[str, dict]:
    """Split OSM XML into GeoJSON FeatureCollections for roads/buildings/pois."""
    tree = ET.parse(osm_path)
    root = tree.getroot()

    nodes: dict[str, tuple[float, float]] = {}
    node_tags: dict[str, dict[str, str]] = {}
    for n in root.findall("node"):
        nid = n.get("id")
        if nid is None or n.get("lon") is None or n.get("lat") is None:
            continue
        nodes[nid] = (float(n.get("lon")), float(n.get("lat")))
        tags = {t.get("k"): t.get("v") for t in n.findall("tag") if t.get("k") and t.get("v")}
        if tags:
            node_tags[nid] = tags

    layers: dict[str, list] = {"roads": [], "buildings": [], "pois": []}

    for nid, tags in node_tags.items():
        if any(k in tags for k in ("amenity", "shop", "tourism", "leisure")):
            lon, lat = nodes[nid]
            layers["pois"].append(
                {
                    "type": "Feature",
                    "properties": {"osm_id": int(nid), "osm_type": "node", **tags},
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                }
            )

    for w in root.findall("way"):
        wid = w.get("id")
        tags = {t.get("k"): t.get("v") for t in w.findall("tag") if t.get("k") and t.get("v")}
        refs = [nd.get("ref") for nd in w.findall("nd") if nd.get("ref")]
        coords = [nodes[r] for r in refs if r in nodes]
        if len(coords) < 2:
            continue
        props = {"osm_id": int(wid) if wid else None, "osm_type": "way", **tags}

        if "highway" in tags:
            layers["roads"].append(
                {
                    "type": "Feature",
                    "properties": props,
                    "geometry": {"type": "LineString", "coordinates": coords},
                }
            )
        if "building" in tags:
            ring = coords if coords[0] == coords[-1] else coords + [coords[0]]
            if len(ring) >= 4:
                layers["buildings"].append(
                    {
                        "type": "Feature",
                        "properties": props,
                        "geometry": {"type": "Polygon", "coordinates": [ring]},
                    }
                )

    out: dict[str, dict] = {}
    for name, feats in layers.items():
        out[name] = {
            "type": "FeatureCollection",
            "name": name,
            "crs": {
                "type": "name",
                "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
            },
            "features": feats,
        }
    return out


def overpass_layer(opener: urllib.request.OpenerDirector, layer: str) -> dict:
    if layer == "roads":
        q = f'[out:json][timeout:180];(way["highway"]({BBOX_OVERPASS}););out body;>;out skel qt;'
    elif layer == "buildings":
        q = f'[out:json][timeout:180];(way["building"]({BBOX_OVERPASS}););out body;>;out skel qt;'
    else:
        q = (
            f'[out:json][timeout:180];('
            f'node["amenity"]({BBOX_OVERPASS});'
            f'node["shop"]({BBOX_OVERPASS});'
            f'node["tourism"]({BBOX_OVERPASS});'
            f'node["leisure"]({BBOX_OVERPASS});'
            f');out body;'
        )
    last_err: Exception | None = None
    for url in OVERPASS_ENDPOINTS:
        try:
            raw = http_post_form(opener, url, {"data": q}, timeout=180)
            payload = json.loads(raw.decode("utf-8"))
            return overpass_to_geojson(payload, layer)
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"  overpass fail {url}: {e}", file=sys.stderr)
            time.sleep(2)
    raise RuntimeError(f"Overpass failed for {layer}: {last_err}")


def overpass_to_geojson(payload: dict, layer: str) -> dict:
    nodes: dict[int, tuple[float, float]] = {}
    for el in payload.get("elements", []):
        if el.get("type") == "node" and "lon" in el and "lat" in el:
            nodes[el["id"]] = (el["lon"], el["lat"])

    features = []
    for el in payload.get("elements", []):
        tags = el.get("tags") or {}
        props = {"osm_id": el.get("id"), "osm_type": el.get("type"), **tags}
        geom = None
        if el.get("type") == "node" and "lon" in el and layer == "pois":
            if any(k in tags for k in ("amenity", "shop", "tourism", "leisure")):
                geom = {"type": "Point", "coordinates": [el["lon"], el["lat"]]}
        elif el.get("type") == "way" and "nodes" in el:
            coords = [nodes[n] for n in el["nodes"] if n in nodes]
            if len(coords) < 2:
                continue
            if layer == "buildings" and tags.get("building"):
                ring = coords if coords[0] == coords[-1] else coords + [coords[0]]
                if len(ring) >= 4:
                    geom = {"type": "Polygon", "coordinates": [ring]}
            elif layer == "roads" and tags.get("highway"):
                geom = {"type": "LineString", "coordinates": coords}
        if geom:
            features.append({"type": "Feature", "properties": props, "geometry": geom})

    return {
        "type": "FeatureCollection",
        "name": layer,
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }


def to_shapefile(geojson_path: Path, shp_path: Path) -> None:
    shp_path.parent.mkdir(parents=True, exist_ok=True)
    for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
        p = shp_path.with_suffix(ext)
        if p.exists():
            p.unlink()
    subprocess.run(
        [
            "ogr2ogr",
            "-f",
            "ESRI Shapefile",
            "-t_srs",
            "EPSG:4326",
            "-lco",
            "ENCODING=UTF-8",
            str(shp_path),
            str(geojson_path),
        ],
        check=True,
    )


def write_layer(name: str, gj: dict) -> None:
    out_json = VECTOR / f"{name}.geojson"
    out_json.write_text(json.dumps(gj, ensure_ascii=False), encoding="utf-8")
    print(f"  {name}: {len(gj['features'])} features → {out_json.name}")
    if not gj["features"]:
        return
    shp = VECTOR / "shp" / name / f"{name}.shp"
    try:
        to_shapefile(out_json, shp)
        print(f"  shapefile → {shp}")
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"  shapefile skipped: {e}", file=sys.stderr)


def main() -> int:
    VECTOR.mkdir(parents=True, exist_ok=True)
    proxy = resolve_proxy()
    opener = build_opener(proxy)
    want = sys.argv[1:] if len(sys.argv) > 1 else ["roads", "buildings", "pois"]
    print(f"AOI bbox W,S,E,N: {BBOX_OSM}")
    print(f"proxy: {proxy or '(none)'}")
    print(f"layers: {want}")

    layers: dict[str, dict] | None = None
    try:
        osm_path = fetch_osm_xml(opener)
        layers = parse_osm_xml(osm_path)
        print("  source: osm-api map export")
    except Exception as e:  # noqa: BLE001
        print(f"OSM API export failed ({e}); falling back to Overpass…", file=sys.stderr)
        layers = {}
        for name in want:
            print(f"Fetching {name} via Overpass…")
            layers[name] = overpass_layer(opener, name)

    for name in want:
        if name not in layers:
            print(f"unknown layer: {name}", file=sys.stderr)
            return 1
        write_layer(name, layers[name])

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
