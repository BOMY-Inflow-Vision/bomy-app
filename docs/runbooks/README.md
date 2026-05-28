# Operational runbooks

This directory holds procedures BOMY staff execute to operate the running system. Each runbook is a self-contained markdown file that names its audience (which roles can run it), the environments it targets, a pre-flight checklist, the actual procedure, a rollback path, and an evidence template.

Runbooks differ from:

- **Specs** (`docs/superpowers/specs/`) — design decisions and rationale.
- **Plans** (`docs/superpowers/plans/`) — implementation step-by-step.
- **PR logs** (`app/log/`, gitignored) — Andy's per-PR Andy-only records.

## Per-flip evidence

When a staff member executes a runbook, they capture evidence under [`evidence/`](./evidence/). See that directory's README for the file naming pattern and redaction rules. Evidence files are committed.

## Current runbooks

| Runbook                                                  | Environments                          | Trigger                                                                      |
| -------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| [`checkout-enabled-flip.md`](./checkout-enabled-flip.md) | local, staging (template), prod (TBD) | First-time enable of buyer checkout on a target env, or rollback to disable. |
