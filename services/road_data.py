"""Versioned road data products. Demo observations never enter the source database.

The visual score is a transparent demonstration rule, not PCI, IRI or a
calibrated safety prediction. Missing observations always produce a null score.
"""
import hashlib
import json
import math
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from functools import lru_cache

SCHEMA_VERSION = "1.0"
SCORE_VERSION = "visual-v1"
SCORE_DESCRIPTION = "100 − min(100, (輕微×3 + 中等×9 + 嚴重×20) × 50/區段公尺)，僅使用截至指定日期的最近一次觀測。"
LICENSES = {
    "demo": "合成資料：僅供比賽展示、整合測試；不代表真實道路狀態，不供行車決策。",
    "internal": "既有巡檢紀錄：限帳號內部評估；未確認來源商業利用權前，不開放第三方轉售或再授權。",
}


@lru_cache(maxsize=1)
def demo_roads():
    return json.loads(Path(__file__).with_name('dongda_demo.json').read_text(encoding='utf-8'))


def demo_counts(sid, period):
    """Canonical synthetic defect density per 50 m, independent of migrations."""
    i = int(sid[1:])
    minor, moderate, severe = (1 + i % 3, 0, 0)
    if sid.startswith('A'):
        minor, moderate, severe = (2, 1 + period // 2,
            int(i in (2,4,5)) + int(period >= 4 and i in (2,4)))
    if sid == 'A05' and period == 5:
        return (1, 0, 0)
    if sid == 'B03':
        moderate = 1
    return minor, moderate, severe


def migrate_demo_roads(db):
    """Versioned, transactional updates to demo geometry; never source imports."""
    roads = demo_roads()
    version = db.execute("SELECT value FROM product_metadata WHERE key='demo_geometry_version'").fetchone()
    if version and version['value'] == roads['version']:
        return
    for segment in roads['segments']:
        old = db.execute("SELECT length_m FROM segments WHERE dataset_id='demo' AND id=?", (segment['id'],)).fetchone()
        if old is None:
            if segment['id'] != 'C03':
                raise ValueError('示範資料區段不完整，取消道路更新')
            db.execute("INSERT INTO segments VALUES (?,?,?,?,?,?)", ('demo', segment['id'], segment['name'], segment['length_m'], json.dumps(segment['geometry']), 'osm_road_demo'))
            for period in range(6):
                day = (date(2026,9,19) - timedelta(days=(5-period)*7)).isoformat()
                minor = max(1, int(math.floor(segment['length_m']/50 + .5)))
                db.execute("INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", ('demo','C03',f'C03-{day}',day+'T08:00:00+08:00',minor,0,0,1,1,None,'synthetic_survey','[]'))
            continue
        factor = segment['length_m'] / 50
        # Regenerate from canonical density, not already-rounded old counts:
        # fresh installs and v1 upgrades must produce identical demo scores.
        for obs in db.execute("SELECT id,observed_at FROM observations WHERE dataset_id='demo' AND segment_id=?", (segment['id'],)).fetchall():
            period = (date.fromisoformat(obs['observed_at'][:10]) - date(2026,8,15)).days // 7
            counts = [int(math.floor(value * factor + .5)) for value in demo_counts(segment['id'],period)]
            db.execute("UPDATE observations SET minor=?,moderate=?,severe=? WHERE dataset_id='demo' AND id=?", (*counts,obs['id']))
        db.execute("UPDATE segments SET name=?,length_m=?,geometry=?,geometry_kind='osm_road_demo' WHERE dataset_id='demo' AND id=?",
                   (segment['name'],segment['length_m'],json.dumps(segment['geometry']),segment['id']))
    db.execute("UPDATE datasets SET title=?,description=?,provenance=?,updated_at=? WHERE id='demo'", (
        roads['title'], f"臺灣大道東側起點至東大路北側終點；{len(roads['segments'])} 個道路區段、六期展示觀測。",
        f"道路線形：OpenStreetMap / OSRM（{roads['retrieved_on']}）；路況、歷史與照片位置為展示設定，非此路段實測。最後一期 2026-09-19。", utcnow()))
    db.execute("INSERT OR REPLACE INTO product_metadata VALUES ('demo_geometry_version',?)", (roads['version'],))


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize(path):
    with connect(path) as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS product_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS datasets (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, source_kind TEXT NOT NULL,
            description TEXT NOT NULL, license TEXT NOT NULL, updated_at TEXT NOT NULL,
            owner_id TEXT, provenance TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS segments (
            dataset_id TEXT NOT NULL REFERENCES datasets(id), id TEXT NOT NULL,
            name TEXT NOT NULL, length_m REAL NOT NULL CHECK(length_m > 0),
            geometry TEXT NOT NULL, geometry_kind TEXT NOT NULL,
            PRIMARY KEY(dataset_id,id)
        );
        CREATE TABLE IF NOT EXISTS observations (
            dataset_id TEXT NOT NULL, segment_id TEXT NOT NULL, id TEXT NOT NULL,
            observed_at TEXT NOT NULL, minor INTEGER NOT NULL CHECK(minor >= 0),
            moderate INTEGER NOT NULL CHECK(moderate >= 0), severe INTEGER NOT NULL CHECK(severe >= 0),
            capture_count INTEGER NOT NULL, reviewed INTEGER NOT NULL DEFAULT 0,
            confidence REAL, source TEXT NOT NULL, evidence_ids TEXT NOT NULL DEFAULT '[]',
            PRIMARY KEY(dataset_id,id),
            FOREIGN KEY(dataset_id,segment_id) REFERENCES segments(dataset_id,id)
        );
        CREATE INDEX IF NOT EXISTS observation_history ON observations(dataset_id,segment_id,observed_at);
        CREATE TABLE IF NOT EXISTS source_points (
            dataset_id TEXT NOT NULL, segment_id TEXT NOT NULL, id TEXT NOT NULL,
            captured_at TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
            severity INTEGER NOT NULL, defect_type INTEGER, road_name TEXT NOT NULL,
            image_path TEXT, image_uncrop_path TEXT,
            PRIMARY KEY(dataset_id,id),
            FOREIGN KEY(dataset_id,segment_id) REFERENCES segments(dataset_id,id)
        );
        CREATE INDEX IF NOT EXISTS source_point_history ON source_points(dataset_id,segment_id,captured_at);
        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, dataset_id TEXT NOT NULL REFERENCES datasets(id),
            name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL,
            created_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
            requests INTEGER NOT NULL DEFAULT 0, last_used TEXT
        );
        """)
        if not db.execute("SELECT 1 FROM datasets WHERE id='demo'").fetchone():
            seed_demo(db)
        migrate_demo_roads(db)


def seed_demo(db):
    # Frozen timestamps keep the dataset reproducible and naturally show staleness over time.
    db.execute("INSERT INTO datasets VALUES (?,?,?,?,?,?,?,?)", (
        "demo", "中部物流示範園區", "synthetic", "16 個示範區段、兩條同起迄點路線與六期合成巡檢。",
        LICENSES["demo"], utcnow(), None,
        "程式生成之合成場域與觀測；最後一期 2026-09-19。座標僅供地理呈現，不對應現地調查。"))
    # Same A/B endpoints: direct route 300m, alternative route 400m.
    direct = [(i * 50, 0) for i in range(7)]
    detour = [(0, 0), (0, 50)] + [(i * 50, 50) for i in range(1, 7)] + [(300, 0)]
    branch = [(150, 0), (150, -50), (200, -50)]
    paths = [("A", "重車直行道", direct), ("B", "外環替代道", detour), ("C", "倉儲支線", branch)]
    anchor = date(2026, 9, 19)
    for prefix, name, points in paths:
        for i, (p, q) in enumerate(zip(points, points[1:]), 1):
            sid = f"{prefix}{i:02d}"
            xy = [[round(120.644 + x / (111320 * math.cos(math.radians(24.181))), 7),
                   round(24.181 + y / 111320, 7)] for x, y in (p, q)]
            db.execute("INSERT INTO segments VALUES (?,?,?,?,?,?)", (
                "demo", sid, f"{name} · {i:02d}", 50, json.dumps({"type": "LineString", "coordinates": xy}), "synthetic_line"))
            for period in range(6):
                if sid == "C02" or (sid == "C01" and period > 2):
                    continue  # Unknown and stale are intentional, not score 100.
                day = (anchor - timedelta(days=(5-period)*7)).isoformat()
                minor, moderate, severe = demo_counts(sid, period)
                db.execute("INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                    "demo", sid, f"{sid}-{day}", day + "T08:00:00+08:00", minor, moderate, severe,
                    1, 1, None, "synthetic_survey", "[]"))


def parse_day(value):
    try:
        day = date.fromisoformat(value) if value else datetime.now(timezone.utc).date()
    except (ValueError, TypeError):
        raise ValueError("日期需為 YYYY-MM-DD")
    if day > datetime.now(timezone.utc).date():
        raise ValueError("日期不可晚於今天")
    return day


def score(obs, length):
    if obs is None:
        return None
    return round(max(0, 100 - (obs["minor"] * 3 + obs["moderate"] * 9 + obs["severe"] * 20) * 50 / length), 1)


def band(value):
    return "unknown" if value is None else ("poor" if value < 60 else "fair" if value < 80 else "good")


def describe_segment(row, observations, day):
    history = [dict(o) for o in observations if o["observed_at"][:10] <= day.isoformat()]
    last = history[-1] if history else None
    value = score(last, row["length_m"])
    previous = score(history[-2], row["length_m"]) if len(history) > 1 else None
    age = (day - date.fromisoformat(last["observed_at"][:10])).days if last else None
    delta = round(value - previous, 1) if previous is not None else None
    return {
        "id": row["id"], "name": row["name"], "length_m": row["length_m"],
        "geometry": json.loads(row["geometry"]), "geometry_kind": row["geometry_kind"],
        "condition_score": value, "condition_band": band(value), "score_delta": delta,
        "observation_count": len(history), "capture_count": sum(o["capture_count"] for o in history),
        "last_observed": last["observed_at"] if last else None, "age_days": age,
        "freshness": "unknown" if age is None else "fresh" if age <= 7 else "aging" if age <= 30 else "stale",
        "minor": last["minor"] if last else None, "moderate": last["moderate"] if last else None,
        "severe": last["severe"] if last else None, "confidence": last["confidence"] if last else None,
        "priority": "inspect" if last is None else "urgent" if value < 60 else "monitor" if value < 80 else "routine",
        "change_alert": delta is not None and delta <= -10,
        "history": [{"observed_at": o["observed_at"], "score": score(o, row["length_m"]),
                     "minor": o["minor"], "moderate": o["moderate"], "severe": o["severe"],
                     "source": o["source"], "evidence_ids": json.loads(o["evidence_ids"])} for o in history],
    }


def snapshot(path, dataset_id, day):
    with connect(path) as db:
        ds = db.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if ds is None:
            raise LookupError("資料集尚未建立；請先同步既有巡檢資料。")
        groups = {}
        for o in db.execute("SELECT * FROM observations WHERE dataset_id=? ORDER BY observed_at,id", (dataset_id,)):
            groups.setdefault(o["segment_id"], []).append(o)
        segments = [describe_segment(s, groups.get(s["id"], []), day) for s in db.execute(
            "SELECT * FROM segments WHERE dataset_id=? ORDER BY id", (dataset_id,))]
        dates = sorted({o["observed_at"][:10] for history in groups.values() for o in history})
    observed = [s for s in segments if s["condition_score"] is not None]
    total = sum(s["length_m"] for s in segments)
    covered = sum(s["length_m"] for s in observed)
    fresh = sum(s["length_m"] for s in observed if s["age_days"] <= 7)
    quality = {
        "registered_km": round(total / 1000, 3), "observed_km": round(covered / 1000, 3),
        "coverage_pct": round(covered / total * 100, 1) if total else 0,
        "fresh_7d_pct": round(fresh / total * 100, 1) if total else 0,
        "segment_count": len(segments), "observed_segments": len(observed),
        "unknown_segments": len(segments)-len(observed),
        "observations": sum(s["observation_count"] for s in segments),
        "captures": sum(s["capture_count"] for s in segments),
        "history_periods": len([d for d in dates if d <= day.isoformat()]),
        "average_score": round(sum(s["condition_score"] * s["length_m"] for s in observed) / covered, 1) if covered else None,
        "high_risk_segments": sum(s["condition_band"] == "poor" for s in segments),
        "change_alerts": sum(s["change_alert"] for s in segments),
        "confidence_available": False,
    }
    return {"schema_version": SCHEMA_VERSION, "score_version": SCORE_VERSION,
            "road_demo": demo_roads() if dataset_id == 'demo' else None,
            "as_of": day.isoformat(), "generated_at": utcnow(), "dataset": dict(ds),
            "quality": quality, "dates": dates, "segments": segments,
            "methodology": {"score": SCORE_DESCRIPTION, "unknown": "未觀測保持未知，不視為無瑕疵。",
                            "confidence": "未提供經校準的可信度；不將模型信心值當成資料準確率。",
                            "coverage": "分母為本資料集登錄區段，並非城市或全台道路。真實匯入使用50m網格近似，無完整路網分母。",
                            "history": "比較各期已觀測資料；未校正採集頻率或視角差異，不等同劣化預測。"}}


def analyze_route(data, ids, name):
    if not isinstance(ids, list) or not 1 <= len(ids) <= 200 or any(not isinstance(s, str) for s in ids):
        raise ValueError("路線須包含 1–200 個有效區段 ID")
    if len(ids) != len(set(ids)):
        raise ValueError("路線含重複區段，請移除重複項目")
    index = {s["id"]: s for s in data["segments"]}
    if any(s not in index for s in ids):
        raise ValueError("路線包含不屬於此資料集的區段")
    route = [index[s] for s in ids]
    length = sum(s["length_m"] for s in route)
    known = [s for s in route if s["condition_score"] is not None]
    known_length = sum(s["length_m"] for s in known)
    exposures = {b: round(sum(s["length_m"] for s in route if s["condition_band"] == b) / length * 100, 2)
                 for b in ("good", "fair", "poor", "unknown")}
    return {"name": name, "segment_ids": ids, "length_m": length,
            "score": round(sum(s["condition_score"] * s["length_m"] for s in known) / known_length, 1) if known_length else None,
            "coverage_pct": round(known_length / length * 100, 1), "exposure_pct": exposures,
            "stale_pct": round(sum(s["length_m"] for s in route if s["age_days"] is not None and s["age_days"] > 7) / length * 100, 1),
            "high_risk_segments": [s["id"] for s in route if s["condition_band"] == "poor"],
            "note": "依所選區段長度加權；不是導航、最佳路徑或行車安全保證。網格資料的長度為名目值。"}


def import_source(path, source_path, owner):
    """Read-only source access; idempotent replacement of this user's derived product."""
    if not Path(source_path).is_file():
        raise ValueError("找不到既有道路資料庫")
    source = sqlite3.connect(Path(source_path).resolve().as_uri() + "?mode=ro", uri=True, timeout=10)
    source.row_factory = sqlite3.Row
    try:
        columns = {r[1] for r in source.execute("PRAGMA table_info(road_defects)")}
        optional = ",".join(name if name in columns else f"NULL AS {name}" for name in ("image_path", "image_uncrop_path"))
        rows = source.execute("SELECT id,latitude,longitude,capture_time,severity,defect_type,city,district,road_section," + optional + " FROM road_defects ORDER BY capture_time,id LIMIT 100001").fetchall()
    except sqlite3.DatabaseError:
        raise ValueError("無法讀取既有巡檢資料，請確認來源資料庫格式與狀態。")
    finally:
        source.close()
    if len(rows) > 100000:
        raise ValueError("此展示匯入上限為十萬筆，請先縮小來源範圍")
    segments, groups, points, skipped = {}, {}, [], 0
    for row in rows:
        try:
            lat, lon = float(row["latitude"]), float(row["longitude"])
            if not (math.isfinite(lat) and math.isfinite(lon) and 21 <= lat <= 26 and 118 <= lon <= 123):
                raise ValueError()
            if row["severity"] not in (0, 1, 2):
                raise ValueError()
            day = date.fromisoformat(str(row["capture_time"])[:10]).isoformat()
            if day > datetime.now(timezone.utc).date().isoformat():
                raise ValueError()
        except (TypeError, ValueError):
            skipped += 1
            continue
        # Fixed local projection for Taiwan; this is spatial grouping, NOT map matching.
        x, y = lon * 111320 * math.cos(math.radians(24)), lat * 111320
        gx, gy = math.floor(x / 50), math.floor(y / 50)
        name = " / ".join(str(row[k] or "未命名") for k in ("city", "district", "road_section"))
        sid = "G-" + hashlib.sha256(f"{name}|{gx}|{gy}".encode()).hexdigest()[:12]
        if sid not in segments:
            center = [(gx + .5) * 50 / (111320 * math.cos(math.radians(24))), (gy + .5) * 50 / 111320]
            segments[sid] = (name, json.dumps({"type": "Point", "coordinates": center}))
        key = (sid, day)
        item = groups.setdefault(key, {"counts": [0, 0, 0], "ids": []})
        item["counts"][row["severity"]] += 1
        item["ids"].append(row["id"])
        points.append((sid, str(row["id"]), str(row["capture_time"]), lat, lon,
                       row["severity"], row["defect_type"], name, row["image_path"], row["image_uncrop_path"]))
    if not groups:
        raise ValueError("來源沒有可用的台灣座標與日期紀錄；保留上次同步結果。")
    dsid = f"live-{owner}"
    with connect(path) as db:
        db.execute("INSERT INTO datasets VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,provenance=excluded.provenance", (
            dsid, "既有巡檢資料集", "imported", "既有瑕疵依道路名稱、50m網格與日期彙整；不是實測50m路段。",
            LICENSES["internal"], utcnow(), str(owner), f"db-service/road_defects 唯讀同步；{len(rows)} 筆來源，{skipped} 筆無效資料略過；缺少無瑕疵巡檢紀錄，不能推算全路網覆蓋率。"))
        db.execute("DELETE FROM observations WHERE dataset_id=?", (dsid,))
        db.execute("DELETE FROM source_points WHERE dataset_id=?", (dsid,))
        db.execute("DELETE FROM segments WHERE dataset_id=?", (dsid,))
        for sid, (name, geometry) in segments.items():
            db.execute("INSERT INTO segments VALUES (?,?,?,?,?,?)", (dsid, sid, name, 50, geometry, "observation_grid_50m"))
        for (sid, day), item in groups.items():
            db.execute("INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                dsid, sid, f"{sid}-{day}", day + "T12:00:00+08:00", *item["counts"], len(item["ids"]),
                0, None, "legacy_defect_records", json.dumps(item["ids"])))
        db.executemany("INSERT INTO source_points VALUES (?,?,?,?,?,?,?,?,?,?,?)", [(dsid, *p) for p in points])
    return {"dataset_id": dsid, "records": sum(len(g["ids"]) for g in groups.values()),
            "segments": len(segments), "skipped": skipped}


def source_points(path, dataset_id, day, segment_id=None, limit=2000, offset=0):
    """Original GPS positions, never inferred from grid centroids. Bounded pagination."""
    if not 1 <= limit <= 2000 or offset < 0:
        raise ValueError("limit 須為 1–2000，offset 不可小於零")
    with connect(path) as db:
        ds = db.execute("SELECT source_kind FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if ds is None:
            raise LookupError("找不到資料集")
        where, args = "dataset_id=? AND substr(captured_at,1,10)<=?", [dataset_id, day.isoformat()]
        if segment_id:
            where += " AND segment_id=?"
            args.append(segment_id)
        total = db.execute("SELECT COUNT(*) FROM source_points WHERE " + where, args).fetchone()[0]
        rows = [dict(r) for r in db.execute("SELECT * FROM source_points WHERE " + where + " ORDER BY captured_at DESC,id LIMIT ? OFFSET ?", args + [limit, offset])]
        indexed = db.execute("SELECT COUNT(*) FROM source_points WHERE dataset_id=?", (dataset_id,)).fetchone()[0]
    for row in rows:
        row["has_image"] = bool(row.pop("image_path"))
        row["has_uncrop_image"] = bool(row.pop("image_uncrop_path"))
    return {"dataset_id": dataset_id, "as_of": day.isoformat(), "source_kind": ds["source_kind"],
            "points": rows, "total": total, "limit": limit, "offset": offset,
            "next_offset": offset + len(rows) if offset + len(rows) < total else None,
            "needs_sync": ds["source_kind"] == "imported" and indexed == 0,
            "coordinate_reference": "WGS84: latitude, longitude；保留來源座標，非道路匹配結果。"}


def evidence_image(path, image_root, dataset_id, record_id, day, variant):
    if variant not in ("crop", "original"):
        raise ValueError("照片種類須為 crop 或 original")
    with connect(path) as db:
        record = db.execute("SELECT image_path,image_uncrop_path FROM source_points WHERE dataset_id=? AND id=? AND substr(captured_at,1,10)<=?",
                            (dataset_id, str(record_id), day.isoformat())).fetchone()
    if record is None:
        raise LookupError("此資料快照沒有該筆觀測")
    filename = record["image_path" if variant == "crop" else "image_uncrop_path"]
    # Never serve paths supplied by the request or escape the configured source image directory.
    if not filename or not isinstance(filename, str) or any(c in filename for c in ("/", "\\", ":", "\x00")) or filename in (".", ".."):
        raise LookupError("照片缺失或來源路徑不受支援")
    root = (Path(image_root) / ("crop" if variant == "crop" else "uncrop")).resolve()
    target = (root / filename).resolve()
    if root not in target.parents or not target.is_file() or target.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        raise LookupError("找不到照片檔案")
    return target
