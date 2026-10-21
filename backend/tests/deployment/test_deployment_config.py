"""Import-time configuration (docs exposure, CORS) is checked in a fresh
subprocess per case, since it is read when the app module is imported."""
import json
import os
import subprocess
import sys

import pytest

pytestmark = pytest.mark.config
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PROBE = r"""
import json, tempfile, os
os.environ["MONETARY_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "p.db")
from fastapi.testclient import TestClient
from monetary.presentation.api.app import app
c = TestClient(app)
def pre(origin):
    r = c.options("/api/v0.5/owner", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
    return {"origin": r.headers.get("access-control-allow-origin"), "creds": r.headers.get("access-control-allow-credentials")}
print(json.dumps({
  "docs": c.get("/docs").status_code, "redoc": c.get("/redoc").status_code, "openapi": c.get("/openapi.json").status_code,
  "root_docs": c.get("/").json()["docs"],
  "hsts": "strict-transport-security" in c.get("/health").headers,
  "good": pre("http://localhost:3000"), "evil": pre("http://evil.example"),
}))
"""


def probe(**env):
    e = {k: v for k, v in os.environ.items() if not k.startswith("MONETARY_")}
    e.update(env, PYTHONPATH=ROOT)
    out = subprocess.run([sys.executable, "-W", "ignore", "-c", PROBE], cwd=ROOT, env=e, capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_defaults_are_production_safe():
    r = probe()
    assert (r["docs"], r["redoc"], r["openapi"]) == (404, 404, 404) and r["root_docs"] is None
    assert r["hsts"] is True
    assert r["good"]["origin"] is None and r["evil"]["origin"] is None       # no CORS origins by default


def test_development_exposes_docs_and_skips_hsts():
    r = probe(MONETARY_ENV="development")
    assert (r["docs"], r["redoc"], r["openapi"]) == (200, 200, 200) and r["root_docs"] == "/docs"
    assert r["hsts"] is False


def test_docs_flag_overrides_environment():
    assert probe(MONETARY_ENV="production", MONETARY_ENABLE_DOCS="true")["docs"] == 200
    assert probe(MONETARY_ENV="development", MONETARY_ENABLE_DOCS="false")["docs"] == 404


def test_explicit_cors_list_allows_only_listed_origins_with_credentials():
    r = probe(MONETARY_CORS_ORIGINS="http://localhost:3000, http://localhost:8501")
    assert r["good"] == {"origin": "http://localhost:3000", "creds": "true"}
    assert r["evil"]["origin"] is None


def test_wildcard_cors_never_combines_with_credentials():
    r = probe(MONETARY_CORS_ORIGINS="*")
    assert r["evil"]["origin"] == "*" and r["evil"]["creds"] is None

