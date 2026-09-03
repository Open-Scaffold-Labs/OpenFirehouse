# Ask Open Firehouse (in-app chat face)

Ask is a **second face of the same product**, not a second product.

After a member signs in, **Ask Open Firehouse** in the top bar opens a
navy OpenFirehouse chat. The agent inherits that session (JWT + role).
There is no bot login and no parallel database.

## What this slice does

- **Duty / Board** is the first live mode. It hangs on the held draft’s
  immediate reads through `POST /api/agent/invoke` with the signed-in
  user's token: `board_read` (Command Board), `duty_read` (today’s
  riding list), plus `incident_read`, `roster_read`,
  `training_hours_read`, and `apparatus_status_read`.
- **Incident closeout** and a dedicated **Training & Apparatus** mode
  are placeholders.
- **Needs your Accept** lists pending `agent_approvals` and points
  Review / Accept at the existing Dashboard. Self-accept stays blocked
  (`SELF_ACCEPT_FORBIDDEN`).
- The UI never names the department-agent plumbing layer.

## Stack

This work is stacked on the held department-agent + approval-queue
draft (public PR #2). That draft stays unmerged until Dale says merge.
Ask does not invent a shadow verb API.

If invoke is missing on a branch that is not stacked, Duty / Board
will say department tools are not on this install yet.

## What this is not

- Not a merge of PR #2 to `main`.
- Not the full agentic platform.
- Not AI writing incident / NFIRS / NERIS narrative.
- Not external Grok / Claude productization (those can be later
  clients of the same plug).
