"""Isolated tests: never open the application/user/source production databases."""
import csv
import base64
import hashlib
import io
import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

import pytest
from flask import Flask
from flask_login import LoginManager, UserMixin

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from services import road_data as data
from routes.data_exchange import init_exchange


class User(UserMixin):
    def __init__(self, id):
        self.id = id


@pytest.fixture
def app(tmp_path):
    app = Flask(__name__, template_folder=str(ROOT / "templates"), static_folder=str(ROOT / "static"))
    app.config.update(TESTING=True, SECRET_KEY="isolated-test-only", ROAD_DATA_STORE=str(tmp_path / "products.db"), ROAD_SOURCE_DB=str(tmp_path / "source.db"))
    manager = LoginManager(app)
    manager.user_loader(lambda id: User(id))
    app.add_url_rule("/login", endpoint="auth.login", view_func=lambda: "login")
    app.add_url_rule("/home", endpoint="defects.home", view_func=lambda: "home")
    with sqlite3.connect(app.config["ROAD_SOURCE_DB"]) as db:
        db.execute("CREATE TABLE road_defects (id INTEGER,latitude REAL,longitude REAL,capture_time TEXT,severity INTEGER,defect_type INTEGER,city TEXT,district TEXT,road_section TEXT)")
        db.executemany("INSERT INTO road_defects VALUES (?,?,?,?,?,?,?,?,?)", [
            (1, 24.181, 120.644, "2026-09-01 08:00:00", 0, 0, "台中", "西屯", "測試路"),
            (2, 24.181, 120.644, "2026-09-01 08:01:00", 2, 1, "台中", "西屯", "測試路"),
            (3, 24.181, 120.644, "2026-09-19 08:00:00", 1, 0, "台中", "西屯", "測試路"),
            (4, None, 120.644, "2026-09-19", 0, 0, "台中", "西屯", "無效"),
            (5, 24.181, 120.644, "invalid", 0, 0, "台中", "西屯", "無效"),
            (6, 24.181, 120.644, "2026-09-19", 9, 0, "台中", "西屯", "無效"),
        ])
        db.execute("ALTER TABLE road_defects ADD COLUMN image_path TEXT")
        db.execute("ALTER TABLE road_defects ADD COLUMN image_uncrop_path TEXT")
        db.execute("UPDATE road_defects SET image_path='evidence.png',image_uncrop_path='evidence.png' WHERE id=1")
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=')
    for folder in ('crop', 'uncrop'):
        image_dir = tmp_path / 'images' / folder
        image_dir.mkdir(parents=True)
        (image_dir / 'evidence.png').write_bytes(png)
    init_exchange(app)
    return app


def login(client, id="1"):
    with client.session_transaction() as session:
        session["_user_id"] = id
        session["_fresh"] = True
        session["data_csrf"] = "test-csrf"
    return {"X-CSRF-Token": "test-csrf"}


def snapshot(app, day="2026-09-19", dataset="demo"):
    return data.snapshot(app.config["ROAD_DATA_STORE"], dataset, date.fromisoformat(day))


def test_demo_is_deterministic_and_unknown_is_not_good(app):
    result = snapshot(app)
    q = result["quality"]
    assert (q["segment_count"], q["observed_segments"], q["history_periods"]) == (17, 16, 6)
    assert q["registered_km"] == 5.211
    assert q["coverage_pct"] == 93.9
    assert q["fresh_7d_pct"] == 82.8
    unknown = next(s for s in result["segments"] if s["id"] == "C02")
    assert unknown["condition_score"] is None and unknown["condition_band"] == "unknown"
    known = [s for s in result['segments'] if s['condition_score'] is not None]
    expected = sum(s['condition_score'] * s['length_m'] for s in known) / sum(s['length_m'] for s in known)
    assert q["average_score"] == round(expected, 1)
    data.initialize(app.config["ROAD_DATA_STORE"])
    assert snapshot(app)["segments"] == result["segments"]


def test_asof_does_not_leak_later_observations(app):
    before = snapshot(app, "2026-09-12")
    after = snapshot(app)
    a = next(s for s in before["segments"] if s["id"] == "A05")
    b = next(s for s in after["segments"] if s["id"] == "A05")
    assert len(a["history"]) == 5 and len(b["history"]) == 6
    assert a["condition_score"] == 48.0 and b["condition_score"] == 97.2
    assert b["score_delta"] == 49.2
    assert all(o["observed_at"][:10] <= "2026-09-12" for s in before["segments"] for o in s["history"])
    empty = snapshot(app, "2020-01-01")
    assert empty["quality"]["average_score"] is None
    assert empty["quality"]["coverage_pct"] == 0
    assert empty["quality"]["unknown_segments"] == 17


def test_route_length_weighting_and_unknown_denominator(app):
    result = snapshot(app)
    a = data.analyze_route(result, [f"A{i:02d}" for i in range(1, 7)], "A")
    b = data.analyze_route(result, [f"B{i:02d}" for i in range(1, 9)], "B")
    assert a["length_m"] == pytest.approx(1902.67) and b["length_m"] == pytest.approx(1205.2)
    assert a["score"] < b["score"] and a["exposure_pct"]["poor"] > b["exposure_pct"]["poor"]
    partial = data.analyze_route(result, ["A05", "C02"], "partial")
    assert partial["score"] == 97.2
    assert partial["coverage_pct"] == round(317.11 / (317.11 + 319.57) * 100, 1)
    assert partial["exposure_pct"]["unknown"] == round(319.57 / (317.11 + 319.57) * 100, 2)
    assert data.analyze_route(result, ["C02"], "unknown")["score"] is None
    result["segments"][0]["length_m"] = 100
    weighted = data.analyze_route(result, ["A01", "A05"], "weighted")
    assert weighted["score"] == round((66.9 * 100 + 97.2 * 317.11) / 417.11, 1)


@pytest.mark.parametrize("ids", [[], ["A01", "A01"], ["not-real"], "A01", [1], None])
def test_route_rejects_invalid_input(app, ids):
    with pytest.raises(ValueError):
        data.analyze_route(snapshot(app), ids, "invalid")


def test_dongda_roads_are_continuous_and_share_endpoints(app):
    result = snapshot(app)
    index = {s['id']: s for s in result['segments']}
    endpoints = []
    for r in result['road_demo']['routes']:
        segments = [index[sid] for sid in r['segment_ids']]
        for a, b in zip(segments, segments[1:]):
            assert a['geometry']['coordinates'][-1] == b['geometry']['coordinates'][0]
        endpoints.append((segments[0]['geometry']['coordinates'][0], segments[-1]['geometry']['coordinates'][-1]))
    assert endpoints[0] == endpoints[1]
    assert endpoints[0] == (result['road_demo']['endpoints']['start']['coordinates'], result['road_demo']['endpoints']['end']['coordinates'])
    assert endpoints[0][0][0] > endpoints[0][1][0]  # Start east, finish north.
    assert endpoints[0][0][1] < endpoints[0][1][1]
    for s in result['segments']:
        assert s['geometry_kind'] == 'osm_road_demo'
        assert s['length_m'] > 0
        assert all(120.60 < lon < 120.621 and 24.18 < lat < 24.201 for lon,lat in s['geometry']['coordinates'])
    client = app.test_client()
    response = client.post('/api/data/v1/routes/analyze?as_of=2026-09-19', json={'routes': result['road_demo']['routes']})
    assert response.status_code == 200
    a,b = response.json['routes']
    assert a['length_m'] == pytest.approx(2988.57)
    assert b['length_m'] == pytest.approx(3686.04)
    assert (a['score'], b['score']) == (94.6,76.5)
    assert a['length_m'] * 1.2 < b['length_m'] < a['length_m'] * 1.3
    page = client.get('/data-exchange').get_data(as_text=True)
    assert 'id="route-street-map"' in page
    assert '離線位置示意' not in page


def test_geometry_migration_preserves_imports_and_api_keys(app):
    data.import_source(app.config['ROAD_DATA_STORE'], Path(app.config['ROAD_SOURCE_DB']), '1')
    before = snapshot(app, dataset='live-1')['segments']
    with data.connect(app.config['ROAD_DATA_STORE']) as db:
        db.execute("INSERT INTO api_keys VALUES ('key','1','demo','test','hash','prefix','2026-09-01',0,4,NULL)")
        # Reconstruct a legacy seed in this isolated DB, without touching keys.
        db.execute("DELETE FROM observations WHERE dataset_id='demo'")
        db.execute("DELETE FROM segments WHERE dataset_id='demo'")
        db.execute("DELETE FROM product_metadata WHERE key='demo_geometry_version'")
        db.execute("UPDATE datasets SET id='demo' WHERE id='demo'")
        # seed_demo creates the dataset too, so collect the legacy in memory.
        legacy = sqlite3.connect(':memory:')
        legacy.row_factory = sqlite3.Row
        for table in ('datasets','segments','observations'):
            schema = db.execute("SELECT sql FROM sqlite_master WHERE name=?", (table,)).fetchone()[0]
            legacy.execute(schema)
        data.seed_demo(legacy)
        for table in ('segments','observations'):
            for row in legacy.execute('SELECT * FROM '+table):
                db.execute('INSERT INTO '+table+' VALUES ('+','.join('?' for _ in row)+')', tuple(row))
        legacy.close()
    data.initialize(app.config['ROAD_DATA_STORE'])
    assert snapshot(app, dataset='live-1')['segments'] == before
    assert all(s['geometry_kind']=='osm_road_demo' for s in snapshot(app)['segments'])
    with data.connect(app.config['ROAD_DATA_STORE']) as db:
        assert db.execute("SELECT requests FROM api_keys WHERE id='key'").fetchone()[0] == 4


def test_v1_upgrade_matches_fresh_install_and_is_idempotent(app, tmp_path, monkeypatch):
    current = data.demo_roads()
    previous = json.loads((ROOT / 'tests/fixtures/dongda_demo_v1.json').read_text())
    path = tmp_path / 'upgrade.db'
    monkeypatch.setattr(data, 'demo_roads', lambda: previous)
    data.initialize(path)
    # Deployed v1 predates the version metadata table.
    with data.connect(path) as db:
        db.execute('DROP TABLE product_metadata')
    monkeypatch.setattr(data, 'demo_roads', lambda: current)
    data.initialize(path)
    upgraded = data.snapshot(path, 'demo', date(2026,9,19))
    assert upgraded['segments'] == snapshot(app)['segments']
    data.initialize(path)
    assert data.snapshot(path, 'demo', date(2026,9,19))['segments'] == upgraded['segments']
    with data.connect(path) as db:
        assert db.execute("SELECT COUNT(*) FROM observations WHERE segment_id='C03'").fetchone()[0] == 6


def test_import_is_read_only_idempotent_and_scoped(app):
    source = Path(app.config["ROAD_SOURCE_DB"])
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    result = data.import_source(app.config["ROAD_DATA_STORE"], source, "1")
    assert result == {"dataset_id": "live-1", "records": 3, "segments": 1, "skipped": 3}
    first = snapshot(app, dataset="live-1")
    data.import_source(app.config["ROAD_DATA_STORE"], source, "1")
    assert snapshot(app, dataset="live-1")["segments"] == first["segments"]
    assert first["segments"][0]["geometry_kind"] == "observation_grid_50m"
    assert first["segments"][0]["history"][0]["evidence_ids"] == [1, 2]
    assert first["segments"][0]["history"][0]["score"] == 77
    assert first["segments"][0]["condition_score"] == 91
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    assert snapshot(app)["quality"]["segment_count"] == 17
    with sqlite3.connect(source) as db:
        db.execute("DELETE FROM road_defects")
    with pytest.raises(ValueError):
        data.import_source(app.config["ROAD_DATA_STORE"], source, "1")
    assert snapshot(app, dataset="live-1")["segments"] == first["segments"]


def test_portal_and_report_render_and_readonly_api(app):
    client = app.test_client()
    assert client.get("/data-exchange").status_code == 200
    report = client.get("/data-exchange/report?as_of=2026-09-19")
    assert report.status_code == 200 and "合成" in report.get_data(as_text=True)
    response = client.get("/api/data/v1/segments?as_of=2026-09-19")
    assert response.status_code == 200
    assert "owner_id" not in response.json["dataset"]
    assert "no-store" in response.headers["Cache-Control"]
    assert client.get("/api/data/v1/segments/A05/history?as_of=2026-09-19").json["segment"]["score_delta"] == 49.2
    assert client.get("/api/data/v1/segments/missing/history").status_code == 404
    assert client.post("/api/data/v1/segments", json={}).status_code == 405


@pytest.mark.parametrize("day", ["not-a-date", "9999-12-31", "2026-02-30"])
def test_invalid_dates(app, day):
    assert app.test_client().get("/api/data/v1/segments", query_string={"as_of": day}).status_code == 400


def test_exports_match_snapshot_and_keep_provenance(app):
    client = app.test_client()
    result = snapshot(app)
    response = client.get("/api/data/v1/export/csv?as_of=2026-09-19")
    rows = list(csv.DictReader(io.StringIO(response.data.decode("utf-8-sig"))))
    assert len(rows) == 17
    assert next(r for r in rows if r["id"] == "C02")["condition_score"] == ""
    assert all(r["source_kind"] == "synthetic" and r["license"] and r["score_version"] == data.SCORE_VERSION for r in rows)
    geo = client.get("/api/data/v1/export/geojson?as_of=2026-09-19").json
    assert geo["type"] == "FeatureCollection" and len(geo["features"]) == 17
    assert geo["features"][0]["geometry"] == result["segments"][0]["geometry"]
    manifest = client.get("/api/data/v1/export/manifest?as_of=2026-09-19").json
    assert manifest["quality"] == result["quality"]
    assert manifest["delivery"]["redistribution"] is False
    assert client.get("/api/data/v1/export/exe").status_code == 400


def test_csv_formula_and_html_injection_are_escaped(app):
    with data.connect(app.config["ROAD_DATA_STORE"]) as db:
        db.execute("UPDATE segments SET name=? WHERE id='A01'", ('=HYPERLINK("evil")<script>bad()</script>',))
    client = app.test_client()
    response = client.get("/api/data/v1/export/csv")
    rows = list(csv.DictReader(io.StringIO(response.data.decode("utf-8-sig"))))
    assert rows[0]["name"].startswith("'=")
    report = client.get("/data-exchange/report").get_data(as_text=True)
    assert "<script>bad()</script>" not in report and "&lt;script&gt;" in report


def test_sync_and_keys_require_login_and_csrf(app):
    client = app.test_client()
    assert client.post("/data-exchange/sync").status_code == 401
    assert client.get("/data-exchange/keys").status_code == 401
    login(client)
    assert client.post("/data-exchange/sync").status_code == 403
    assert client.post("/data-exchange/keys", json={"name": "test"}).status_code == 403
    assert client.post("/data-exchange/keys/no-key/revoke").status_code == 403


def test_customer_isolation_and_key_lifecycle(app):
    owner, other, external = app.test_client(), app.test_client(), app.test_client()
    csrf = login(owner)
    login(other, "2")
    assert owner.post("/data-exchange/sync", headers=csrf).status_code == 200
    assert other.get("/api/data/v1/segments?dataset=live-1").status_code == 401
    assert external.get("/api/data/v1/export/csv?dataset=live-1").status_code == 401
    assert other.get("/data-exchange/report?dataset=live-1").status_code == 401
    created = owner.post("/data-exchange/keys", headers=csrf, json={"name": "TMS", "dataset": "live-1"})
    assert created.status_code == 201
    token, keyid = created.json["token"], created.json["id"]
    auth = {"Authorization": "Bearer " + token}
    with data.connect(app.config["ROAD_DATA_STORE"]) as db:
        row = dict(db.execute("SELECT * FROM api_keys WHERE id=?", (keyid,)).fetchone())
        assert row["token_hash"] == hashlib.sha256(token.encode()).hexdigest()
        assert token not in str(row)
    assert external.get("/api/data/v1/segments", headers=auth).json["dataset"]["id"] == "live-1"
    assert external.get("/api/data/v1/segments?dataset=demo", headers=auth).status_code == 401
    assert [d["id"] for d in external.get("/api/data/v1/catalog", headers=auth).json["datasets"]] == ["live-1"]
    listed = owner.get("/data-exchange/keys").json["keys"][0]
    assert listed["requests"] == 2 and token not in str(listed) and "token_hash" not in listed
    assert other.post(f"/data-exchange/keys/{keyid}/revoke", headers=csrf).status_code == 404
    assert owner.post(f"/data-exchange/keys/{keyid}/revoke", headers=csrf).status_code == 200
    assert external.get("/api/data/v1/segments", headers=auth).status_code == 401
    assert [d["id"] for d in other.get("/api/data/v1/catalog").json["datasets"]] == ["demo"]


def test_api_validation_and_request_size(app):
    client = app.test_client()
    url = "/api/data/v1/routes/analyze?as_of=2026-09-19"
    assert client.post(url, json={"routes": [{"name": "A", "segment_ids": ["A01"]}]}).status_code == 200
    for body in ({}, None, {"routes": []}, {"routes": [None]}, {"routes": [{"name": 4}]}):
        assert client.post(url, json=body).status_code == 400
    assert client.post(url, data="a" * 65537, content_type="application/json").status_code == 413
    assert client.get("/api/data/v1/catalog", headers={"Authorization": "Bearer bad"}).status_code == 401


def test_key_input_and_limit(app):
    client = app.test_client()
    csrf = login(client)
    assert client.post("/data-exchange/keys", headers=csrf, json={"name": " "}).status_code == 400
    assert client.post("/data-exchange/keys", headers=csrf, json={"name": "test", "dataset": "live-2"}).status_code == 401
    assert client.post("/data-exchange/keys", headers=csrf, json={"name": "test", "dataset": "live-1"}).status_code == 400
    for i in range(10):
        assert client.post("/data-exchange/keys", headers=csrf, json={"name": str(i)}).status_code == 201
    assert client.post("/data-exchange/keys", headers=csrf, json={"name": "11"}).status_code == 400


def synced(app):
    client = app.test_client()
    csrf = login(client)
    assert client.post('/data-exchange/sync', headers=csrf).status_code == 200
    return client, csrf


def test_original_gps_and_bounded_observation_pagination(app):
    client, _ = synced(app)
    body = client.get('/api/data/v1/observations?dataset=live-1&as_of=2026-09-19&limit=2').json
    assert body['total'] == 3 and body['next_offset'] == 2 and not body['needs_sync']
    point = body['points'][0]
    assert point['latitude'] == 24.181 and point['longitude'] == 120.644
    assert point['captured_at'] == '2026-09-19 08:00:00'
    assert point['defect_type'] == 0 and point['severity'] == 1
    assert 'image_path' not in point and 'image_uncrop_path' not in point
    segment = snapshot(app, dataset='live-1')['segments'][0]
    assert segment['geometry']['coordinates'] != [point['longitude'], point['latitude']]
    final = client.get('/api/data/v1/observations?dataset=live-1&as_of=2026-09-19&limit=2&offset=2').json
    assert len(final['points']) == 1 and final['next_offset'] is None
    before = client.get('/api/data/v1/observations?dataset=live-1&as_of=2026-09-01').json
    assert before['total'] == 2
    assert client.get('/api/data/v1/observations?dataset=live-1&as_of=2020-01-01').json['total'] == 0
    assert client.get('/api/data/v1/observations?dataset=live-1&segment_id=nope').json['total'] == 0


@pytest.mark.parametrize('query',['limit=0','limit=2001','limit=nope','offset=-1','offset=nope'])
def test_observation_invalid_pagination(app, query):
    assert app.test_client().get('/api/data/v1/observations?'+query).status_code == 400


def test_photos_are_scoped_dated_and_have_correct_bytes(app):
    client, csrf = synced(app)
    body = client.get('/api/data/v1/observations?dataset=live-1&as_of=2026-09-19').json
    point = next(p for p in body['points'] if p['id']=='1')
    for field in ('image_url','original_image_url'):
        url = point[field]
        response = client.get(url)
        assert response.status_code == 200 and response.mimetype == 'image/png'
        assert response.data.startswith(b'\x89PNG')
        assert 'no-store' in response.headers['Cache-Control']
        assert app.test_client().get(url).status_code == 401
        other = app.test_client()
        login(other, '2')
        assert other.get(url).status_code == 401
        assert client.get(url.replace('2026-09-19','2020-01-01')).status_code == 404
    assert client.get('/api/data/v1/observations/1/image/invalid?dataset=live-1').status_code == 400
    assert client.get('/api/data/v1/observations/2/image/crop?dataset=live-1').status_code == 404
    token = client.post('/data-exchange/keys', headers=csrf, json={'name':'photo-test','dataset':'live-1'}).json['token']
    assert app.test_client().get(point['image_url'],headers={'Authorization':'Bearer '+token}).status_code == 200
    assert app.test_client().get('/api/data/v1/observations?dataset=demo',headers={'Authorization':'Bearer '+token}).status_code == 401


@pytest.mark.parametrize('filename',['../../source.db','/etc/passwd','..\\source.db','https://example.com/image.jpg','evidence.svg','missing.png'])
def test_photo_path_and_missing_file_protection(app, filename):
    client, _ = synced(app)
    with data.connect(app.config['ROAD_DATA_STORE']) as db:
        db.execute('UPDATE source_points SET image_path=? WHERE id=?',(filename,'1'))
    assert client.get('/api/data/v1/observations/1/image/crop?dataset=live-1').status_code == 404


def test_legacy_dataset_requests_resync_and_demo_has_no_fake_gps(app):
    client, _ = synced(app)
    with data.connect(app.config['ROAD_DATA_STORE']) as db:
        db.execute("DELETE FROM source_points WHERE dataset_id='live-1'")
    assert client.get('/api/data/v1/observations?dataset=live-1').json['needs_sync'] is True
    demo = client.get('/api/data/v1/observations?dataset=demo').json
    assert demo['total']==0 and demo['source_kind']=='synthetic' and demo['needs_sync'] is False


def test_photo_symlink_cannot_escape_source_directory(app):
    client, _ = synced(app)
    root=Path(app.config['ROAD_SOURCE_IMAGES'])
    (root/'crop'/'escape.png').symlink_to(Path(app.config['ROAD_SOURCE_DB']))
    with data.connect(app.config['ROAD_DATA_STORE']) as db:
        db.execute("UPDATE source_points SET image_path='escape.png' WHERE id='1'")
    assert client.get('/api/data/v1/observations/1/image/crop?dataset=live-1').status_code == 404
