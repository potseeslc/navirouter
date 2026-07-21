# Deployment Security

NaviRouter v1 is designed for LAN or VPN access. Do not expose it directly to the public internet.

## Recommended Exposure

Use one of these access patterns:

- Same LAN only.
- Tailnet or VPN, such as Tailscale, WireGuard, or a private Cloudflare Tunnel application.
- Reverse proxy with HTTPS plus an additional authentication layer.

NaviRouter is not intended to be the public security boundary by itself. It forwards Subsonic credentials to Navidrome and exposes diagnostics that are safe for trusted operators, not anonymous internet users.

## Reverse Proxy Requirements

If you put NaviRouter behind a reverse proxy, configure the proxy to provide:

- HTTPS.
- Access control before requests reach NaviRouter.
- Request size limits.
- Reasonable rate limits.
- Trusted upstream routing only to the NaviRouter container or host port.

Keep NaviRouter's own upstream allowlists configured even when a proxy is in front of it.

Example proxy posture:

```text
Internet/VPN user -> HTTPS proxy with auth -> NaviRouter -> Navidrome
                                               \-> AudioMuse
```

## Docker Secrets

Prefer file-based AudioMuse tokens over plain environment variables when using Docker.

Example:

```env
AUDIOMUSE_API_TOKEN=
AUDIOMUSE_API_TOKEN_FILE=/run/secrets/audiomuse_api_token
```

Mount the secret file read-only into the NaviRouter container. `AUDIOMUSE_API_TOKEN` still works for local testing and takes precedence when both values are set.

## Navidrome Database Lookup

`NAVIDROME_DB_PATH` is optional. It lets NaviRouter perform read-only library ID lookups so AudioMuse radio can stay inside the selected or inferred Navidrome library.

If NaviRouter can read the SQLite file directly:

```env
NAVIDROME_DB_PATH=/data/navidrome.db
NAVIDROME_DB_CONTAINER=
```

If NaviRouter runs on the Docker host while Navidrome stores the DB inside a container volume:

```env
NAVIDROME_DB_PATH=/data/navidrome.db
NAVIDROME_DB_CONTAINER=navidrome
NAVIROUTER_DOCKER_CLI=/usr/local/bin/docker
```

The Docker-backed mode shells out to `docker exec` for read-only SQLite lookups. Use it for trusted homelab host installs, not as a generic hosted-service pattern.

## Diagnostics Sharing

`/api/router/status` redacts Subsonic auth fields and authorization headers. It may still reveal operational details such as:

- Internal service URLs.
- Client names.
- Recently requested Subsonic methods.
- Song IDs, titles, artists, and albums from the last radio queue.
- Whether a client omitted library scope.

Before sharing diagnostics publicly:

- Review `services`, `upstreams`, `recent`, `lastRadioQueue`, and `playbackTraffic`.
- Remove private hostnames, IPs, client names, and any library details you do not want public.
- Do not share raw URLs from client logs unless you have checked that `u`, `p`, `t`, and `s` are redacted.

## Public Internet Checklist

Before considering any public exposure:

- [ ] HTTPS is required.
- [ ] External authentication is required.
- [ ] NaviRouter is not reachable directly without the proxy/auth layer.
- [ ] Navidrome and AudioMuse are not publicly reachable unless separately hardened.
- [ ] `NAVIROUTER_ALLOWED_NAVIDROME_HOSTS` is set narrowly.
- [ ] `NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS` is set narrowly.
- [ ] `NAVIROUTER_MAX_BODY_BYTES` is set to a reasonable value.
- [ ] Diagnostics have been reviewed for safe sharing.

If any item is unclear, keep NaviRouter LAN/VPN-only.
