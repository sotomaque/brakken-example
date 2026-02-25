---
description: Audit the codebase against TypeScript, React, Next.js, and performance best practices
argument-hint: [--focus ts|react|nextjs|perf|test|all]
skills: accelint-ts-best-practices, accelint-ts-performance, accelint-react-best-practices, accelint-ts-testing, vercel-react-best-practices, accelint-nextjs-best-practices
---

# audit

Run a comprehensive best-practices audit of the codebase using all available skills.

## Arguments

- `focus` (string, optional, default: "all"): Which audit category to run
  - Validation: Must be one of: ts, react, nextjs, perf, test, all

## Skill Mapping

| Focus     | Skill(s)                                                        |
|-----------|-----------------------------------------------------------------|
| `ts`      | accelint-ts-best-practices                                      |
| `react`   | accelint-react-best-practices, vercel-react-best-practices      |
| `nextjs`  | accelint-nextjs-best-practices                                  |
| `perf`    | accelint-ts-performance                                         |
| `test`    | accelint-ts-testing                                             |
| `all`     | All of the above                                                |

## Workflow

1. Determine which skills to invoke based on `--focus` argument (default: all)
2. For each skill in scope, launch a parallel Explore agent that:
   - Reads the skill's full rule set
   - Scans all source files under `src/` (excluding `src/__tests__/`)
   - Checks every rule against every file
   - Records violations with: rule ID, file path, line number, severity, and suggested fix
3. Collect results from all agents
4. Deduplicate findings that overlap between skills (e.g., React rules that appear in both accelint-react and vercel-react)
5. Output a unified report sorted by severity (CRITICAL > HIGH > MEDIUM > LOW)

## Report Format

Output a markdown report with the following structure:

### Summary Table

| Severity | Count |
|----------|-------|
| CRITICAL | N     |
| HIGH     | N     |
| MEDIUM   | N     |
| LOW      | N     |

### Findings by Severity

For each finding:
- **Rule**: rule ID and short name
- **File**: file path with line number (as markdown link)
- **Issue**: one-line description of the violation
- **Fix**: concrete suggested fix (code snippet if applicable)

### Already Correct

List patterns the codebase already follows well, grouped by category. This helps the user see what's working.

## Scope

Audit these directories:
- `src/components/` — React components
- `src/hooks/` — Custom hooks
- `src/lib/` — Pure utility functions and types
- `src/store.ts` — Zustand store
- `src/app/` — Next.js app router pages and layouts

Exclude:
- `src/__tests__/` — Test files (unless `--focus test`, in which case audit test files specifically)
- `node_modules/`, `.next/`, `dist/`

## Examples

```bash
/audit                  # Full audit against all skills
/audit --focus react    # React-only audit
/audit --focus ts       # TypeScript best practices only
/audit --focus perf     # Performance patterns only
/audit --focus test     # Test quality audit
/audit --focus nextjs   # Next.js patterns only
```
