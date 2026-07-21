# Security Policy

NaviRouter is intended for LAN/VPN deployments in its current MVP form. Do not expose it directly to the public internet.

## Supported Scope

Security reports are useful for:

- Credential leakage in logs, diagnostics, errors, or docs.
- Unsafe proxy behavior.
- SSRF or upstream allowlist bypasses.
- Request-body handling problems.
- Docker secret handling problems.
- Cross-user cache or data exposure.

## Reporting

For now, report security concerns privately to the maintainer before opening a public issue. If you only have access to the public project, open a minimal issue saying you have a security report without including exploit details or secrets.

Do not include:

- Navidrome passwords.
- Subsonic `p`, `t`, or `s` values.
- AudioMuse bearer tokens.
- Full private network topology.
- Private library metadata beyond what is needed to reproduce.

## Deployment Guidance

- Prefer LAN/VPN only.
- Put HTTPS and additional authentication in front of any remote access.
- Use `AUDIOMUSE_API_TOKEN_FILE` for Docker secret-style token mounting.
- Keep `NAVIROUTER_ALLOWED_NAVIDROME_HOSTS` and `NAVIROUTER_ALLOWED_AUDIOMUSE_HOSTS` narrow.
- Review `/api/router/status` before sharing diagnostics.
