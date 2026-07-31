#!/usr/bin/env python3
"""Auto-download DEM (Copernicus GLO-30) and Sentinel-2 RGB for Hejing AOI.

Default HTTP proxy: http://127.0.0.1:1087 (Privoxy).
  DGGS_PROXY=http://127.0.0.1:1087 python3 scripts/fetch_rasters.py
  DGGS_PROXY= python3 scripts/fetch_rasters.py
  python3 scripts/fetch_rasters.py dem
  python3 scripts/fetch_rasters.py ortho
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RASTER = ROOT / "raster"
META = json.loads((ROOT / "meta.json").read_text(encoding="utf-8"))
AOI = META["aoi"]
WEST, SOUTH, EAST, NORTH = AOI["west"], AOI["south"], AOI["east"], AOI["north"]

DEFAULT_PROXY = "http://127.0.0.1:1087"
DEM_OUT = RASTER / "dem_glo30.tif"
ORTHO_OUT = RASTER / "ortho_s2_rgb.tif"
STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
STAC_SIGN = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"


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
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    )


def download(opener: urllib.request.OpenerDirector, url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "DGGS-testdata-hejing/0.1"},
        method="GET",
    )
    print(f"  GET {url[:110]}…")
    with opener.open(req, timeout=600) as resp, tmp.open("wb") as f:
        total = resp.headers.get("Content-Length")
        total_n = int(total) if total and total.isdigit() else None
        done = 0
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if total_n:
                pct = 100.0 * done / total_n
                print(f"\r  {done/1e6:.1f}/{total_n/1e6:.1f} MB ({pct:.0f}%)", end="", flush=True)
            else:
                print(f"\r  {done/1e6:.1f} MB", end="", flush=True)
    print()
    tmp.replace(dest)


def glo30_tile_urls(west: float, south: float, east: float, north: float) -> list[str]:
    """1° Copernicus GLO-30 COG tiles covering the bbox (AWS public)."""
    urls: list[str] = []
    lat0 = math.floor(south)
    lat1 = math.floor(north - 1e-9)
    lon0 = math.floor(west)
    lon1 = math.floor(east - 1e-9)
    for lat in range(lat0, lat1 + 1):
        for lon in range(lon0, lon1 + 1):
            ns = "N" if lat >= 0 else "S"
            ew = "E" if lon >= 0 else "W"
            la = f"{abs(lat):02d}"
            lo = f"{abs(lon):03d}"
            name = f"Copernicus_DSM_COG_10_{ns}{la}_00_{ew}{lo}_00_DEM"
            urls.append(
                f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
            )
    return urls


def gdal_crop(src: Path, dst: Path, res: float | None = None) -> None:
    cmd = [
        "gdalwarp",
        "-overwrite",
        "-te",
        str(WEST),
        str(SOUTH),
        str(EAST),
        str(NORTH),
        "-t_srs",
        "EPSG:4326",
        "-r",
        "bilinear",
        "-co",
        "COMPRESS=DEFLATE",
        "-co",
        "TILED=YES",
    ]
    if res is not None:
        cmd += ["-tr", str(res), str(res)]
    cmd += [str(src), str(dst)]
    print(" ", " ".join(cmd))
    subprocess.run(cmd, check=True)


def fetch_dem(opener: urllib.request.OpenerDirector) -> None:
    print("== DEM Copernicus GLO-30 ==")
    urls = glo30_tile_urls(WEST, SOUTH, EAST, NORTH)
    raw_dir = RASTER / "_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    tiles: list[Path] = []
    for url in urls:
        name = url.rstrip("/").split("/")[-1]
        path = raw_dir / name
        if path.exists() and path.stat().st_size > 1_000_000:
            print(f"  cache hit {path.name}")
        else:
            download(opener, url, path)
        tiles.append(path)

    if len(tiles) == 1:
        gdal_crop(tiles[0], DEM_OUT)
    else:
        vrt = raw_dir / "dem_mosaic.vrt"
        subprocess.run(["gdalbuildvrt", str(vrt), *[str(t) for t in tiles]], check=True)
        gdal_crop(vrt, DEM_OUT)
    print(f"  → {DEM_OUT} ({DEM_OUT.stat().st_size/1e6:.1f} MB)")


def aoi_covers(bbox: list[float]) -> bool:
    return bbox[0] <= WEST and bbox[1] <= SOUTH and bbox[2] >= EAST and bbox[3] >= NORTH


def sign_href(opener: urllib.request.OpenerDirector, href: str) -> str:
    url = f"{STAC_SIGN}?{urllib.parse.urlencode({'href': href})}"
    req = urllib.request.Request(url, headers={"User-Agent": "DGGS-testdata-hejing/0.1"})
    with opener.open(req, timeout=60) as resp:
        return json.loads(resp.read().decode())["href"]


def fetch_ortho(opener: urllib.request.OpenerDirector) -> None:
    print("== Sentinel-2 L2A visual (Planetary Computer) ==")
    body = json.dumps(
        {
            "collections": ["sentinel-2-l2a"],
            "bbox": [WEST, SOUTH, EAST, NORTH],
            "datetime": "2024-01-01T00:00:00Z/2026-12-31T23:59:59Z",
            "query": {"eo:cloud_cover": {"lt": 15}},
            "limit": 20,
        }
    ).encode()
    req = urllib.request.Request(
        STAC_SEARCH,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "DGGS-testdata-hejing/0.1",
        },
        method="POST",
    )
    with opener.open(req, timeout=60) as resp:
        fc = json.loads(resp.read().decode())

    features = [f for f in fc.get("features", []) if "visual" in f.get("assets", {})]
    covering = [f for f in features if aoi_covers(f["bbox"])]
    pool = covering or features
    if not pool:
        raise RuntimeError("no Sentinel-2 scenes found for AOI")

    pool.sort(key=lambda f: f["properties"].get("eo:cloud_cover", 99))
    item = pool[0]
    cloud = item["properties"].get("eo:cloud_cover")
    print(f"  scene {item['id']}  cloud={cloud}  covers_aoi={aoi_covers(item['bbox'])}")

    href = sign_href(opener, item["assets"]["visual"]["href"])
    raw = RASTER / "_raw" / f"{item['id']}_visual.tif"
    if not (raw.exists() and raw.stat().st_size > 1_000_000):
        download(opener, href, raw)
    else:
        print(f"  cache hit {raw.name}")

    # ~10 m in degrees near 42N
    gdal_crop(raw, ORTHO_OUT, res=0.0001)
    print(f"  → {ORTHO_OUT} ({ORTHO_OUT.stat().st_size/1e6:.1f} MB)")

    meta_path = RASTER / "ortho_s2_meta.json"
    meta_path.write_text(
        json.dumps(
            {
                "id": item["id"],
                "datetime": item["properties"].get("datetime"),
                "eo:cloud_cover": cloud,
                "bbox_src": item["bbox"],
                "aoi": AOI,
                "source": "Microsoft Planetary Computer sentinel-2-l2a",
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def update_meta_status(kinds: list[str]) -> None:
    meta = json.loads((ROOT / "meta.json").read_text(encoding="utf-8"))
    if "dem" in kinds and DEM_OUT.exists():
        meta["layers"]["dem"]["status"] = "downloaded"
        meta["layers"]["dem"]["bytes"] = DEM_OUT.stat().st_size
    if "ortho" in kinds and ORTHO_OUT.exists():
        meta["layers"]["ortho"]["status"] = "downloaded"
        meta["layers"]["ortho"]["bytes"] = ORTHO_OUT.stat().st_size
    (ROOT / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    RASTER.mkdir(parents=True, exist_ok=True)
    proxy = resolve_proxy()
    opener = build_opener(proxy)
    want = sys.argv[1:] if len(sys.argv) > 1 else ["dem", "ortho"]
    print(f"AOI W,S,E,N: {WEST},{SOUTH},{EAST},{NORTH}")
    print(f"proxy: {proxy or '(none)'}")
    print(f"tasks: {want}")

    try:
        if "dem" in want:
            fetch_dem(opener)
        if "ortho" in want:
            fetch_ortho(opener)
    except (urllib.error.URLError, subprocess.CalledProcessError, RuntimeError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    update_meta_status(want)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
