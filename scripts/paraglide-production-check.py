"""Exercise the actual Nitro build against an isolated, disposable Postgres."""

from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPConnection
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import json
import os
import socket
import subprocess
import sys
import time


root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
container = os.environ["SPIKE_POSTGRES_CONTAINER"]
database_port = int(os.environ.get("SPIKE_POSTGRES_PORT", "54331"))
server_port = int(os.environ.get("SPIKE_SERVER_PORT", "33331"))
host = "127.0.0.1"
database = "paraglide_production_spike"
worker_token = "synthetic-paraglide-spike-worker-token"
state_dir = root / ".private/production-check"
state_dir.mkdir(parents=True, exist_ok=True)

with socket.socket() as probe:
    assert probe.connect_ex((host, server_port)) != 0, "Production-check port is occupied"


def sql(command):
    subprocess.run(
        ["docker", "exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", command],
        check=True,
        capture_output=True,
        text=True,
    )


sql(f"CREATE DATABASE {database}")
env = os.environ | {
    "NODE_ENV": "production",
    "PORT": str(server_port),
    "NITRO_PORT": str(server_port),
    "HOST": host,
    "NITRO_HOST": host,
    "DATABASE_URL": f"postgres://postgres:postgres@{host}:{database_port}/{database}",
    "BETTER_AUTH_URL": f"http://{host}:{server_port}",
    "BETTER_AUTH_SECRET": "synthetic-paraglide-spike-secret-at-least-32-characters",
    "GITHUB_CLIENT_ID": "synthetic-spike-client",
    "GITHUB_CLIENT_SECRET": "synthetic-spike-client-secret",
    "OWNER_GITHUB_ID": "91827",
    "WORKER_TOKEN": worker_token,
    "STORAGE_DIR": str(state_dir / "storage"),
    "ANTHROPIC_API_KEY": "",
    "EMBEDDINGS_API_KEY": "",
    "ADOBE_FONTS_API_TOKEN": "",
}
subprocess.run(["pnpm", "--filter", "@m3-inspo/db", "db:migrate"], cwd=root, env=env, check=True)
# A fresh synthetic catalog avoids an unrelated network sync when Nitro starts.
subprocess.run(
    ["docker", "exec", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-c",
     "INSERT INTO font_catalog VALUES ('spike', 'Spike', 'sans', ARRAY[400], ARRAY['normal'], false, 'OFL', false, '2026-10-31', now())"],
    check=True,
    capture_output=True,
    text=True,
)


def request(path, headers=None, method="GET"):
    connection = HTTPConnection(host, server_port, timeout=10)
    try:
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read().decode()
    finally:
        connection.close()


with (state_dir / "server.log").open("w") as log:
    server = subprocess.Popen(["node", "apps/web/.output/server/index.mjs"], cwd=root, env=env, stdout=log, stderr=log)
    try:
        deadline = time.monotonic() + 30
        while True:
            if server.poll() is not None:
                raise RuntimeError("Nitro exited before readiness")
            try:
                if request("/anmelden")[0] == 200:
                    break
            except OSError:
                pass
            if time.monotonic() > deadline:
                raise TimeoutError("Nitro did not become ready")
            time.sleep(0.1)

        for cookie, locale, message in [
            (None, "en", "Private design library"),
            ("en", "en", "Private design library"),
            ("de", "de", "Private Designbibliothek"),
            ("invalid", "en", "Private design library"),
        ]:
            headers = {"accept-language": "de-DE,de;q=0.9"}
            if cookie:
                headers["cookie"] = "PARAGLIDE_LOCALE=" + cookie
            status, response_headers, body = request("/anmelden?next=%2Fgenerator%3Fprimary%3Dvivid", headers)
            assert status == 200
            assert "location" not in response_headers
            assert response_headers["x-robots-tag"] == "noindex, nofollow"
            assert f'<html lang="{locale}">' in body and message in body

        def concurrent_page(index):
            locale = "en" if index % 2 == 0 else "de"
            status, _, body = request("/anmelden", {"cookie": "PARAGLIDE_LOCALE=" + locale})
            assert status == 200 and f'<html lang="{locale}">' in body

        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(concurrent_page, range(24)))

        page = "/generator?brand=123456~exact&primary=vivid"
        status, headers, _ = request(page, {"cookie": "PARAGLIDE_LOCALE=de"})
        assert status == 307
        target = urlparse(headers["location"])
        assert target.path == "/anmelden" and parse_qs(target.query)["next"] == [page]

        for path in ["/api/mcp", "/api/worker/claim"]:
            status, headers, body = request(path, {"cookie": "PARAGLIDE_LOCALE=de"}, "POST")
            assert status == 401 and "location" not in headers and "<html" not in body

        status, _, body = request("/api/worker/claim", {"authorization": "Bearer " + worker_token}, "POST")
        assert status == 200
        assert json.loads(body) == {"job": None}
        print("PASS: actual Nitro output, English default, German cookie, invalid-cookie fallback, 24 parallel SSR requests, owner redirect with query, MCP/worker token protection.")
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()

with socket.socket() as probe:
    assert probe.connect_ex((host, server_port)) != 0, "Owned Nitro process did not release its port"
print("PASS: owned Nitro server stopped and its port is free.")
