# Monitoring

## Uptime Kuma

Two monitors cover the full stack:

### Monitor 1 — Full-stack HTTP

Hits oauth2-proxy's built-in `/ping` endpoint, which returns `200 OK` without authentication. This validates the entire request path (network → oauth2-proxy → job-tracker).

| Setting | Value |
|---|---|
| Type | HTTP(S) |
| URL | `https://<your-public-url>/ping` |
| Expected status | 200 |
| Expected body | `OK` |
| Interval | 60s |

### Monitor 2 — Docker container health

Reads the `job-tracker` container's built-in health status (the `wget http://localhost:3000/` check defined in `docker-compose.yml`). Catches app-level failures (crashed process, DB issues) independently of the proxy.

| Setting | Value |
|---|---|
| Type | Docker Container |
| Container name | `job-tracker-job-tracker-1` (verify with `docker ps`) |
| Interval | 60s |

Requires Uptime Kuma to have read access to the Docker socket:

```yaml
uptime-kuma:
  image: louislam/uptime-kuma:1
  volumes:
    - uptime-kuma-data:/app/data
    - /var/run/docker.sock:/var/run/docker.sock:ro
  ports:
    - "127.0.0.1:3001:3001"
```

### Coverage

| Failure scenario | Detected by |
|---|---|
| oauth2-proxy down | Monitor 1 |
| job-tracker crash | Monitor 1 + Monitor 2 |
| job-tracker unhealthy (DB locked, etc.) | Monitor 2 |
| Network / DNS issues | Monitor 1 |

---

## Container health checks

Defined in `docker-compose.yml`. The `job-tracker` container runs a health check every 30s:

```
wget -qO- http://localhost:3000/
```

- **Interval**: 30s
- **Timeout**: 5s
- **Retries**: 3 (marks unhealthy after 3 consecutive failures)
- **Start period**: 15s grace period on startup

`oauth2-proxy` uses `condition: service_healthy` in its `depends_on`, so it will not start until `job-tracker` passes its health check.

The oauth2-proxy image is distroless (no shell or wget), so no container-level health check is defined for it — Uptime Kuma Monitor 1 covers it externally instead.

---

## Log access

```bash
# Live logs
docker compose logs -f job-tracker
docker compose logs -f oauth2-proxy

# Last 100 lines
docker compose logs --tail=100 job-tracker
```

## Quick status check

```bash
docker compose ps
```

The `STATUS` column shows health state: `Up (healthy)`, `Up (unhealthy)`, or `Up (starting)`.
