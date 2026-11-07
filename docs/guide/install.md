# Install and operate

The short version is in the [README quick start](../../README.md#quick-start). This page covers the rest.

## Requirements

- Docker with Compose 2.24 or later. The production overlay uses `!reset`, which older Compose versions do not understand.
- A private OIDC provider you control, such as PocketID, Authentik, Authelia or Keycloak.
- A reverse proxy that terminates HTTPS in front of the web app and the MCP server.

## Authentication

The stack runs two containers. `oauth2-proxy` handles browser sign-in against your OIDC provider and passes the signed-in email to the app. The app scopes every record to that email.

`docker-compose.yml` sets `OAUTH2_PROXY_EMAIL_DOMAINS=*`, which means anyone your provider vouches for can sign in. That is safe with a private provider whose user list you control. **It is not safe with a public provider** such as Google or GitHub: anyone with an account there could sign in. If you point `OIDC_ISSUER_URL` at a public provider, you must also restrict `OAUTH2_PROXY_EMAIL_DOMAINS`.

The proxy uses oauth2-proxy's generic `oidc` provider, so any standards-compliant OIDC issuer should work. PocketID is the one in daily use.

To set up the client in your provider:

- **Redirect URI:** `https://your-domain.com/oauth2/callback`
- **Scopes:** `openid profile email`
- Note the client ID and secret for `.env`.

Programmatic access (the REST API and MCP) does not go through oauth2-proxy. It uses personal API keys created in **Settings → API keys**, hashed with `SERVER_API_KEY_SECRET`.

## Ports and reverse proxy

| Service | Host port | Variable | Notes |
|---------|-----------|----------|-------|
| Web app (through oauth2-proxy) | 3000 | `LISTEN_PORT` | Serves the SPA, REST API and CardDAV |
| MCP server | 3563 | `MCP_LISTEN_PORT` | Streamable HTTP, served at `/`, Bearer API key on every request |

The MCP server answers at the root of its port. To expose it as `https://your-domain.com/mcp`, have your reverse proxy route `/mcp` to `host:3563/`. A separate hostname such as `mcp.your-domain.com` works too.

The CardDAV address book for [iPhone contacts](iphone-contacts.md) is reached without browser sign-in. `docker-compose.yml` already lists `/carddav/` and `/.well-known/carddav` in `OAUTH2_PROXY_SKIP_AUTH_ROUTES`.

## Starting

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` is committed. It adds the restart policy and swaps the source build for the published image `ghcr.io/fergus/job-tracker:latest`. Do not edit `docker-compose.yml` to get the same effect: keeping the tracked files clean is what makes `git pull` safe later.

If you need extra settings that the base file does not pass through (see [Configuration](#configuration)), put them in an untracked third file and add it with another `-f`.

## Updating

```bash
git pull
docker compose pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Updates replace the containers only. Your data lives in mounted directories and is untouched.

## Data and backups

| Path on host | Contents |
|--------------|----------|
| `./data/` | SQLite database `job-tracker.db` (WAL mode) |
| `./uploads/` | Attachment files |

Both are created on first start and survive restarts, rebuilds and updates. To back up:

```bash
cp -r data/ data-backup/
cp -r uploads/ uploads-backup/
```

The database runs in WAL mode, so stop the stack before copying if you need a guaranteed consistent snapshot.

## Configuration

Set these in `.env`. `.env.example` lists them all with comments.

| Variable | Default | Purpose |
|----------|---------|---------|
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | none | Your OIDC client |
| `PUBLIC_URL` | none | External URL, no trailing slash. Also used for MCP upload links |
| `COOKIE_SECRET` | none | oauth2-proxy session cookie |
| `SERVER_API_KEY_SECRET` | none | Required. The app will not start without it |
| `LISTEN_PORT` | `3000` | Host port for the web app |
| `MCP_LISTEN_PORT` | `3563` | Host port for the MCP server |
| `COOKIE_SECURE` | `true` | Set `false` only for plain-HTTP local testing |
| `ADMIN_EMAILS` | none | Comma-separated. Admins can view all users' data read-only |
| `RATE_LIMIT_API`, `RATE_LIMIT_UPLOADS` | `100`, `20` | Requests per minute per IP |
| `INSTANCE_TIMEZONE` | container TZ, then UTC | IANA zone that decides when a follow-up is due |

### Optional: LLM features

Job description extraction and document generation call the OpenAI API. They are off unless `OPENAI_API_KEY` is set. Without it they report that they are not configured, and everything else works. Read [What leaves your server](data-flows.md) before turning them on.

`docker-compose.yml` does not pass `OPENAI_API_KEY` or `LLM_MODEL` into the container. To enable the features, add them to the `job-tracker` service in your untracked override file:

```yaml
services:
  job-tracker:
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - LLM_MODEL=${LLM_MODEL:-gpt-4o-mini}
```
