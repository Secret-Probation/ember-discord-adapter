# {ID} — {title}

| Field | Value |
|-------|--------|
| **Repo** | `{repo}` |
| **Base branch** | `main` (CP) / `master` (Voxen) |
| **Feature branch** | `{branch}` |
| **PR title** | `{pr_title}` |
| **Depends on** | {deps} |
| **Blocks** | {blocks} |
| **SPEC** | {spec_sections} |

## Task prompt (give this to the agent)

{task_prompt}

## Scope

{scope}

## Likely touchpoints

{touchpoints}

## Out of scope

{out_of_scope}

## Environment / secrets

{env}

## Acceptance checklist (PR merge gate)

{checklist}

## Test plan

{tests}

## PR body template

```markdown
## Summary
- …

## Spec
- SPEC.md §…

## Test plan
- [ ] …
```
