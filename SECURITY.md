# Security Policy

## Supported versions

Security fixes are released for the latest `1.x` minor version. Please upgrade before reporting an issue you found on an older release.

| Version | Supported |
| ------- | --------- |
| 1.x (latest) | Yes |
| < 1.0 | No |

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Use GitHub's private reporting: <https://github.com/kdigivn/kdigi-cms-open/security/advisories/new>.

Please include:

- affected version or commit, and how you run KDIGI CMS (Docker, VPS, Coolify, …);
- a description of the issue and its impact (what can an attacker read, change, or run?);
- reproduction steps or a proof of concept;
- any suggested fix.

You can expect an acknowledgement within **3 working days** and a status update within **10 working days**. We will credit reporters in the release notes unless you ask us not to. Please give us a reasonable time to ship a fix before public disclosure (we aim for 90 days at most).

## Scope

In scope: this repository (admin UI, REST/GraphQL API, custom endpoints, access control, the WordPress importer, Docker images and compose files).

Particularly interesting areas:

- **Site isolation:** a user of one site reading or writing another site's content (see [roles and permissions](docs/roles-and-permissions.md)).
- **Secrets:** per-site storage credentials and API keys are hidden from API responses; anything that leaks them is a vulnerability.
- **SSRF:** server-side fetching (`media/from-url`, WordPress importer) is guarded by `src/lib/ssrf-guard.ts`.
- **Public endpoints:** comment creation and ratings are intentionally public; bypasses of their abuse controls (reCAPTCHA verification, collection whitelist, field bounding) are in scope. Request-rate limiting is expected at the reverse proxy.
- **HTML sanitising** of rendered Markdown content (stored XSS).

Out of scope: vulnerabilities in third-party dependencies with no demonstrable impact on KDIGI CMS (report those upstream), social engineering, denial of service by sheer traffic volume, and issues requiring a compromised admin account with the `super-admin` role (that role is trusted by design).

## Hardening checklist for operators

- Set `PAYLOAD_SECRET` to a random value of at least 32 characters (production boot fails otherwise).
- Put the CMS behind HTTPS, restrict database access to the app network, and change the default `POSTGRES_PASSWORD` of the local compose file if its port is reachable.
- Create the first admin user right after deploying (the first user becomes `super-admin`), before exposing the admin to the internet; do not run the demo seed (`SEED_DEMO`) on a real install.
- Back up the database and media volume; see [deploy](docs/deploy.md).
- Keep dependencies updated; see [upgrading](docs/upgrading.md).
