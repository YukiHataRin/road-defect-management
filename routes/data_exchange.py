"""Data product portal and scoped read-only customer API."""
import csv
import hashlib
import hmac
import io
import json
import secrets
from pathlib import Path

from flask import Blueprint, Response, current_app, jsonify, render_template, request, session, url_for, redirect, g, send_file
from flask_login import current_user

from services import road_data as data

exchange_bp = Blueprint("exchange", __name__)


def storage():
    return current_app.config["ROAD_DATA_STORE"]


def error(message, status=400):
    return jsonify({"error": message}), status


def check_csrf():
    return hmac.compare_digest(session.get("data_csrf", ""), request.headers.get("X-CSRF-Token", "")) and bool(session.get("data_csrf"))


def authorized_dataset():
    token_header = request.headers.get("Authorization", "")
    token_dataset = None
    if token_header:
        if not token_header.startswith("Bearer ") or len(token_header) > 256:
            raise PermissionError("API Key 無效或已撤銷")
        hashed = hashlib.sha256(token_header[7:].encode()).hexdigest()
        with data.connect(storage()) as db:
            key = db.execute("SELECT * FROM api_keys WHERE token_hash=? AND revoked=0", (hashed,)).fetchone()
            if key is None:
                raise PermissionError("API Key 無效或已撤銷")
            token_dataset = key["dataset_id"]
            g.data_key_id = key["id"]
    selected = request.args.get("dataset", token_dataset or "demo")
    if token_dataset and selected != token_dataset:
        raise PermissionError("此 API Key 不含指定資料集的存取權")
    if selected != "demo" and not token_dataset:
        if not current_user.is_authenticated or selected != f"live-{current_user.id}":
            raise PermissionError("請登入具有此資料集權限的帳號，或提供該資料集的 API Key")
    return selected


def load_snapshot():
    return data.snapshot(storage(), authorized_dataset(), data.parse_day(request.args.get("as_of")))


@exchange_bp.before_request
def api_request_guard():
    if request.path.startswith(request.script_root + "/api/data/") or request.path.startswith("/api/data/"):
        if request.content_length and request.content_length > 65536:
            return error("請求超過 64 KB 上限", 413)


@exchange_bp.after_request
def response_headers(response):
    if request.endpoint and request.endpoint.startswith("exchange."):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        if g.get("data_key_id") and response.status_code < 400:
            with data.connect(storage()) as db:
                db.execute("UPDATE api_keys SET requests=requests+1,last_used=? WHERE id=?", (data.utcnow(), g.data_key_id))
    return response


@exchange_bp.errorhandler(ValueError)
def bad_value(exc):
    return error(str(exc))


@exchange_bp.errorhandler(LookupError)
def missing_value(exc):
    return error(str(exc), 404)


@exchange_bp.errorhandler(PermissionError)
def denied(exc):
    return error(str(exc), 401)


@exchange_bp.get("/data-exchange")
def portal():
    if request.args.get("dataset", "demo") != "demo" and not current_user.is_authenticated:
        return redirect(url_for("auth.login"))
    session.setdefault("data_csrf", secrets.token_hex(32))
    return render_template("data_exchange/index.html", csrf_token=session["data_csrf"],
                           user_id=str(current_user.id) if current_user.is_authenticated else None,
                           map_config=current_app.config["ROAD_MAP_CONFIG"])


@exchange_bp.get("/api/data/v1/catalog")
def catalog():
    # Key holders see only their licensed dataset; web users see demo + own import.
    selected = authorized_dataset()
    if g.get("data_key_id"):
        ids = [selected]
    else:
        ids = ["demo"] + ([f"live-{current_user.id}"] if current_user.is_authenticated else [])
    with data.connect(storage()) as db:
        datasets = [dict(row) for row in db.execute(
            "SELECT id,title,source_kind,description,license,updated_at,provenance FROM datasets WHERE id IN (" + ",".join("?" for _ in ids) + ")", ids)]
    return jsonify({"schema_version": data.SCHEMA_VERSION, "datasets": datasets})


@exchange_bp.get("/api/data/v1/segments")
def segments():
    result = load_snapshot()
    result["dataset"].pop("owner_id", None)
    return jsonify(result)


@exchange_bp.get("/api/data/v1/segments/<segment_id>/history")
def history(segment_id):
    result = load_snapshot()
    segment = next((s for s in result["segments"] if s["id"] == segment_id), None)
    if segment is None:
        raise LookupError("找不到此區段")
    return jsonify({"dataset": result["dataset"]["id"], "as_of": result["as_of"], "segment": segment,
                    "score_version": data.SCORE_VERSION, "license": result["dataset"]["license"]})


@exchange_bp.post("/api/data/v1/routes/analyze")
def routes():
    result = load_snapshot()
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not isinstance(body.get("routes"), list) or not 1 <= len(body["routes"]) <= 4:
        raise ValueError("請提供 1–4 條 routes，每條含 name 與 segment_ids")
    analyzed = []
    for route in body["routes"]:
        if not isinstance(route, dict) or not isinstance(route.get("name", "路線"), str):
            raise ValueError("路線格式錯誤")
        analyzed.append(data.analyze_route(result, route.get("segment_ids"), route.get("name", "路線")[:80]))
    return jsonify({"as_of": result["as_of"], "dataset": result["dataset"]["id"],
                    "license": result["dataset"]["license"], "routes": analyzed})


@exchange_bp.get("/api/data/v1/observations")
def observations():
    dataset = authorized_dataset()
    result = data.source_points(storage(), dataset, data.parse_day(request.args.get("as_of")),
                                request.args.get("segment_id"), int(request.args.get("limit", 2000)),
                                int(request.args.get("offset", 0)))
    for point in result["points"]:
        for field, variant, available in (("image_url", "crop", "has_image"), ("original_image_url", "original", "has_uncrop_image")):
            point[field] = url_for("exchange.observation_image", record_id=point["id"], variant=variant,
                                   dataset=dataset, as_of=result["as_of"]) if point[available] else None
    return jsonify(result)


@exchange_bp.get("/api/data/v1/observations/<record_id>/image/<variant>")
def observation_image(record_id, variant):
    target = data.evidence_image(storage(), current_app.config["ROAD_SOURCE_IMAGES"], authorized_dataset(),
                                 record_id, data.parse_day(request.args.get("as_of")), variant)
    return send_file(str(target), conditional=True)


def feature(segment, result):
    properties = {k: v for k, v in segment.items() if k not in ("geometry", "history")}
    properties.update(dataset_id=result["dataset"]["id"], source_kind=result["dataset"]["source_kind"],
                      as_of=result["as_of"], score_version=data.SCORE_VERSION, license=result["dataset"]["license"])
    return {"type": "Feature", "id": segment["id"], "geometry": segment["geometry"], "properties": properties}


@exchange_bp.get("/api/data/v1/export/<format>")
def export(format):
    if format not in ("csv", "geojson", "manifest"):
        raise ValueError("支援 csv、geojson、manifest")
    result = load_snapshot()
    result["dataset"].pop("owner_id", None)
    if format == "csv":
        output = io.StringIO(newline="")
        columns = ["id", "name", "length_m", "geometry_kind", "condition_score", "condition_band", "observation_count", "capture_count", "last_observed", "freshness", "score_delta"]
        extras = ["dataset_id", "source_kind", "as_of", "score_version", "license"]
        writer = csv.DictWriter(output, fieldnames=columns + extras)
        writer.writeheader()
        for segment in result["segments"]:
            properties = feature(segment, result)["properties"]
            row = {k: properties.get(k) for k in columns + extras}
            # Prevent spreadsheet formula execution when source road names are untrusted.
            for k, v in row.items():
                if isinstance(v, str) and v.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
                    row[k] = "'" + v
            writer.writerow(row)
        payload, mimetype, suffix = "\ufeff" + output.getvalue(), "text/csv; charset=utf-8", "csv"
    elif format == "geojson":
        payload = json.dumps({"type": "FeatureCollection", "metadata": {k: result[k] for k in ("dataset", "as_of", "schema_version", "score_version", "methodology")},
                              "features": [feature(s, result) for s in result["segments"]]}, ensure_ascii=False, allow_nan=False)
        mimetype, suffix = "application/geo+json", "geojson"
    else:
        manifest = {k: result[k] for k in ("dataset", "quality", "schema_version", "score_version", "as_of", "generated_at", "methodology")}
        manifest["delivery"] = {"formats": ["CSV UTF-8 BOM", "GeoJSON WGS84", "REST JSON"],
                                "billing": "展示環境，無訂單、扣款或正式商業授權", "redistribution": False}
        payload, mimetype, suffix = json.dumps(manifest, ensure_ascii=False, indent=2), "application/json", "json"
    return Response(payload, content_type=mimetype,
                    headers={"Content-Disposition": f'attachment; filename="road-data-{result["dataset"]["id"]}-{result["as_of"]}.{suffix}"'})


@exchange_bp.get("/data-exchange/report")
def report():
    result = load_snapshot()
    return render_template("data_exchange/report.html", result=result)


@exchange_bp.post("/data-exchange/sync")
def sync():
    if not current_user.is_authenticated:
        return error("請先登入以同步既有巡檢資料", 401)
    if not check_csrf():
        return error("驗證碼失效，請重新整理頁面", 403)
    result = data.import_source(storage(), current_app.config["ROAD_SOURCE_DB"], str(current_user.id))
    return jsonify(result)


@exchange_bp.route("/data-exchange/keys", methods=["GET", "POST"])
def keys():
    if not current_user.is_authenticated:
        return error("請登入以管理資料 API Key", 401)
    with data.connect(storage()) as db:
        if request.method == "GET":
            rows = db.execute("SELECT id,name,dataset_id,prefix,created_at,revoked,requests,last_used FROM api_keys WHERE owner_id=? ORDER BY created_at DESC", (str(current_user.id),))
            return jsonify({"keys": [dict(r) for r in rows]})
        if not check_csrf():
            return error("驗證碼失效，請重新整理頁面", 403)
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            raise ValueError("請提供 JSON 物件")
        name, dataset = body.get("name", ""), body.get("dataset", "demo")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
            raise ValueError("金鑰名稱須為 1–80 個字")
        if dataset not in ("demo", f"live-{current_user.id}"):
            raise PermissionError("無此資料集權限")
        if not db.execute("SELECT 1 FROM datasets WHERE id=?", (dataset,)).fetchone():
            raise ValueError("請先同步資料集")
        if db.execute("SELECT COUNT(*) FROM api_keys WHERE owner_id=? AND revoked=0", (str(current_user.id),)).fetchone()[0] >= 10:
            raise ValueError("最多保留 10 把有效金鑰，請先撤銷不用的金鑰")
        token = "rdd_" + secrets.token_urlsafe(32)
        key_id = secrets.token_hex(12)
        db.execute("INSERT INTO api_keys(id,owner_id,dataset_id,name,token_hash,prefix,created_at) VALUES (?,?,?,?,?,?,?)", (
            key_id, str(current_user.id), dataset, name.strip(), hashlib.sha256(token.encode()).hexdigest(), token[:10], data.utcnow()))
        return jsonify({"id": key_id, "token": token, "dataset_id": dataset,
                        "message": "僅顯示一次；此金鑰只允許讀取指定資料集。正式對外使用需 HTTPS。"}), 201


@exchange_bp.post("/data-exchange/keys/<key_id>/revoke")
def revoke(key_id):
    if not current_user.is_authenticated:
        return error("請先登入", 401)
    if not check_csrf():
        return error("驗證碼失效，請重新整理頁面", 403)
    with data.connect(storage()) as db:
        changed = db.execute("UPDATE api_keys SET revoked=1 WHERE id=? AND owner_id=?", (key_id, str(current_user.id))).rowcount
        if not changed:
            raise LookupError("找不到此金鑰")
    return jsonify({"revoked": True})


def init_exchange(app):
    app.config.setdefault("ROAD_DATA_STORE", str(Path(app.instance_path) / "road_intelligence.db"))
    app.config.setdefault("ROAD_SOURCE_DB", str(Path(app.root_path).parent / "db-service" / "data" / "road_defects.db"))
    app.config.setdefault("ROAD_SOURCE_IMAGES", str(Path(app.config["ROAD_SOURCE_DB"]).parent / "images"))
    app.config.setdefault("ROAD_MAP_CONFIG", {
        "tileUrl": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "attribution": '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        "maxZoom": 19,
    })
    data.initialize(app.config["ROAD_DATA_STORE"])
    app.register_blueprint(exchange_bp)
