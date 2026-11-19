"""The server secret file and the Turnstile HTTP call."""
import io
import json
import stat
import urllib.error

from monetary.infrastructure import instance_secret, turnstile


def test_the_secret_is_created_once_kept_private_and_reused(tmp_path):
    first = instance_secret.load_secret(tmp_path)
    assert len(first) == 64 and instance_secret.load_secret(tmp_path) == first
    path = tmp_path / instance_secret.SECRET_FILENAME
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    instance_secret._cache.clear()
    assert instance_secret.load_secret(tmp_path) == first  # a restarted process reads the same key


def test_an_environment_secret_wins_over_the_file(tmp_path, monkeypatch):
    monkeypatch.setenv("MONETARY_SECRET_KEY", " from-env ")
    assert instance_secret.load_secret(tmp_path) == b"from-env"
    assert not (tmp_path / instance_secret.SECRET_FILENAME).exists()


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_turnstile_reports_success_and_failure(monkeypatch):
    sent = {}

    def fake_urlopen(request, timeout):
        sent["body"] = request.data.decode()
        return _Response(json.dumps({"success": True}).encode())

    monkeypatch.setattr(turnstile.urllib.request, "urlopen", fake_urlopen)
    assert turnstile.verify("tok", secret="s", remote_ip="9.9.9.9") is True
    assert "response=tok" in sent["body"] and "remoteip=9.9.9.9" in sent["body"]

    monkeypatch.setattr(turnstile.urllib.request, "urlopen", lambda r, timeout: _Response(b'{"success": false}'))
    assert turnstile.verify("tok", secret="s", remote_ip=None) is False


def test_turnstile_fails_closed_when_cloudflare_is_unreachable(monkeypatch):
    def boom(request, timeout):
        raise urllib.error.URLError("offline")

    monkeypatch.setattr(turnstile.urllib.request, "urlopen", boom)
    assert turnstile.verify("tok", secret="s", remote_ip=None) is False
