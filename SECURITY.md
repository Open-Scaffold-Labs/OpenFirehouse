# Security Policy

OpenFirehouse handles operationally sensitive data — personnel records,
incident details, scene locations, pre-incident plans, Knox Box
contents. We take security reports seriously.

## Supported versions

This project is at `v0.13`. Security patches will be released against
the latest tagged version. No long-term support for older versions is
offered at this time.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: **dale@openscaffoldlabs.com**

> A dedicated `security@openscaffoldlabs.com` Google Group is being
> set up. Until then, the address above is the right destination.

What to include in your report:

- Description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept code is welcome)
- Browser + OS + database backend where you reproduced it
- Whether you've shared details with anyone else
- Suggested fix, if any
- Whether you'd like to be credited in the release notes

What to expect from us:

- Acknowledgement within 7 days
- A substantive response within 30 days
- A target fix window communicated by the response, based on severity
- Credit in the release notes when the fix ships, unless you ask
  to remain anonymous

## Scope

Vulnerabilities we want to hear about:

- Authentication or authorization bypasses
- SQL injection in the Express API or `pg`-based queries
- Cross-site scripting in the React client
- Cross-site request forgery on state-changing endpoints
- Insecure direct object references (e.g. an authenticated user
  reading another department's data)
- Sensitive data exposure (credentials, tokens, PII in logs or
  responses)
- Anything that allows reading or modifying data across department
  boundaries

Out of scope:

- Vulnerabilities in the underlying Postgres, Vercel, Supabase, or
  Anthropic services (please report those upstream)
- Issues that require physical access to a department's server
- Self-XSS or social engineering
- Missing security headers without a demonstrable exploit

## Operational guidance for departments

If you're running OpenFirehouse in production:

- Set a strong, unique `JWT_SECRET` in `server/.env` — never use the
  example value
- Restrict `CLIENT_ORIGIN` to your actual domain(s) — do not use `*`
  in production
- Keep your `ANTHROPIC_API_KEY` server-side only (never bundle it
  into the client)
- Rotate JWTs and API keys at least annually
- Subscribe to GitHub releases on this repo for security advisories
- Apply patches promptly when advised

## Disclosure policy

We follow coordinated disclosure: vulnerabilities are disclosed
publicly after a fix is available, with credit to the reporter.

We do not currently run a bug-bounty program. Credit, gratitude, and
an honest conversation are what we can offer.
