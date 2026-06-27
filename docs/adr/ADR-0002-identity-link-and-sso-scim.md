# ADR-0002 — Login ↔ Member ↔ Certification identity link, and the SSO/SCIM-ready shape

- **Status:** Accepted (2026-06-18)
- **Deciders:** Matt (Owner), Dale (DB/security surface — greenlit)
- **Supersedes/relates:** Builds on P4 provisioning (migration 0012) and Phase E
  qualification-weighted staffing. Implemented by migrations `0028`–`0030` + the
  P1 backfill script + the P5 confirm-link surface.

## Context

OpenFirehouse is a life-safety platform. A responder's certifications drive the
staffing board; a mis-linked certification is a deposition exhibit, not a bug
ticket. The account (`users`), the person/roster record (`members`), and the
certifications (`member_qualifications`) were only loosely coupled: `members.user_id`
existed but was unpopulated for ~98% of prod members (46 of 47), and the
accountability record (`incident_responses`) carried only `user_id` + a
denormalized `member_name`, so a responder was resolved to a person **by name** as
a fallback. Names are not unique (`Nathan McGee` vs `Nathan P. McGee` both exist in
demo data, same station), so name resolution can silently mis-score.

## Decision

1. **The internal join key is `members.id` (the PK) — immutable.** All FKs point at
   it (`member_qualifications.member_id`, now also `incident_responses.member_id`).
   Names, emails, badge numbers are **attributes**, never join keys.

2. **The account↔person link is `members.user_id → users.id`, set deterministically
   at account creation on every provisioning path.** Never inferred from name in
   production. Migration `0028` adds a partial unique `(user_id, department_id)` so
   one login maps to at most one member per department.

3. **Keep `users`/`members` split — do NOT merge.** This is exactly the SCIM
   (RFC 7643) shape: a separate auth identity linked to a domain person record by a
   stable FK. No rewrite needed.

4. **Email is a *matcher*, never the identity key** (False Identifier anti-pattern).
   The backfill (P1) may *propose* a link from a department-unique email, but the
   persisted result is `user_id`; the email may later change freely.

5. **A responder is scored as qualified ONLY when resolved to a member by a STABLE
   id.** A name-only or unresolved responder renders as an explicit, visually
   distinct **"Unlinked — confirm in Roster setup"** state (rose token, distinct
   from qualified/partial/open) — never silently scored, never silently mis-scored.

6. **Deactivate, never hard-delete people.** `incident_responses.member_id` is
   `ON DELETE RESTRICT` (D3) so the accountability record can't be orphaned;
   members are deactivated by a status flip. This prevents the "marking a person
   inactive strips them from historical calls" failure pattern.

7. **SSO/SCIM-ready now; full server later.** `users.external_id` and
   `members.external_id` (migration `0028`, partial-unique) are the SCIM `externalId`
   correlation key and the SAML subject value. **Linking resolves by `external_id`,
   never email-as-key.** No SAML/SCIM server is built until a metro/county/federal
   customer is signed (scope discipline — do not build SCIM before anyone asks).
   `members.personnel_id` is the agency-badge/employee-number attribute.

## Consequences

- New departments provisioned after migration `0030` are fully linked from day one
  (the founding chief is rostered + linked atomically inside `of_provision_department`).
  They never see the "Unlinked members" card.
- Legacy/migrated rows (the 46 unlinked on prod) are resolved by the chief via the
  P5 confirm-link UI, which shows the matching *evidence* so the chief confirms a
  reason, not a guess. Backfill (P1) auto-links only *unambiguous* stable-key
  matches; the verified prod dry-run found **0** such matches, so no auto-link
  occurred — every prod legacy row routes through chief confirmation by design.
- Every link / verify / deactivate writes the append-only `audit_log` (actor +
  timestamp); `GET /api/members/:id/history` surfaces that chain as a read-only
  "personnel record history" view — a credential-verification audit trail that is a
  differentiation lane.
- Permissions continue to ride ONLY on `users.role` (gated by `rank_verified`);
  `members.rank` stays a display label. Linking an unverified member binds identity
  at the lowest mapping role and never elevates — elevation stays with `/verify`.

## Alternatives considered

- **Backfill by name** (v1 draft): rejected — cannot disambiguate duplicate names
  and would auto-create the exact mis-link this whole effort exists to prevent.
- **Merge `users` and `members` into one table:** rejected — breaks the SCIM shape,
  forces a large rewrite, and couples auth lifecycle to roster lifecycle (legal
  records must outlive an account).
- **Build SCIM provisioning now:** deferred — over-building before a customer needs
  it. The dormant `external_id` columns + this ADR are the entire footprint until then.
