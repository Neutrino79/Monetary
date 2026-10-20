"""A request's connection is opened by one worker thread and used by another
(FastAPI runs dependencies and sync endpoints in a thread pool). The connection
must tolerate that, or a real server answers some requests with a 500."""
from concurrent.futures import ThreadPoolExecutor

from monetary.infrastructure import db as db_module


def test_connection_can_be_used_from_a_different_thread(tmp_path):
    conn = db_module.connect(tmp_path / "t.db")
    with ThreadPoolExecutor(max_workers=1) as pool:
        assert pool.submit(lambda: conn.execute("SELECT COUNT(*) FROM user").fetchone()[0]).result() == 0
    conn.close()


def test_a_live_server_style_request_sequence_never_hits_the_thread_check(tmp_path, monkeypatch):
    """Mimics get_db (open in thread A) + endpoint (use in thread B) repeatedly."""
    monkeypatch.setenv("MONETARY_DB_PATH", str(tmp_path / "s.db"))
    with ThreadPoolExecutor(max_workers=4) as opener, ThreadPoolExecutor(max_workers=4) as worker:
        for _ in range(25):
            conn = opener.submit(db_module.connect, tmp_path / "s.db").result()
            assert worker.submit(lambda c=conn: c.execute("SELECT 1").fetchone()[0]).result() == 1
            conn.close()
