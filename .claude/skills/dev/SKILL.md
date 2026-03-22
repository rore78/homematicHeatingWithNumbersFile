---
name: dev
description: Build a specification from specs/ into working, tested, verified code. Supports solo mode (default) and --team mode for agent team delegation.
argument-hint: <spec-name-or-number> [--team]
disable-model-invocation: true
effort: max
---

# Development Skill

Build a specification into working, tested, verified code.

## Input

`$ARGUMENTS`

Parse the arguments:
- The spec identifier (e.g., "epic 2", "01-foundation", or a number)
- The `--team` flag (if present, activate team mode)

## Step 1: Find and Read the Specification

1. List files in `specs/` to find the matching specification file (`*-specification.md`)
2. Read the full specification file
3. Read the brainstorming file if it exists (`*-brainstorming.md`) for additional context
4. Read `specs/roadmap.md` to understand dependencies and big picture
5. Read all source files referenced in the specification

If no specification file exists for the requested epic, tell the user to run `/spec` first.

## Step 2: Create Progress Tracker

Create `specs/{nr}-{name}-progress.md` (or update if it exists) with:

```markdown
# {Epic Name} -- Progress

## Steps

- [ ] Step 1: ...
- [ ] Step 2: ...
...

## Log
```

Extract steps from the specification's "Implementierungsreihenfolge" section. This file MUST be kept up to date throughout development.

## Step 3: Create Task List

**MANDATORY: Use the TaskCreate tool** to create tasks for every step from the specification.

- One task per implementation step
- Set dependencies between tasks using `addBlockedBy` where the specification defines ordering
- Mark tasks as `in_progress` when you start them, `completed` when done
- Never batch multiple tasks -- mark each as completed as soon as it is done

## Step 4: Execute (Solo Mode or Team Mode)

Check if `--team` was passed in arguments.

---

### SOLO MODE (default -- no --team flag)

Execute each task sequentially:

1. **Update task** to `in_progress`
2. **Read** all files that need modification
3. **Implement** the changes following the specification exactly
4. **Run verification** (tests, lint, format) after each step
5. **Fix** any issues found during verification
6. **Commit** with a descriptive message following the commit strategy from the spec
7. **Update task** to `completed`
8. **Update** `specs/{nr}-{name}-progress.md` -- mark the step as done and log the commit hash

After all tasks complete, proceed to Step 5 (Verification).

---

### TEAM MODE (--team flag present)

You are the **Team Lead**. You must NOT do any coding, research, file reading, verification, or testing yourself. You ONLY delegate and coordinate.

#### Team Lead Rules

- **NEVER** use Read, Edit, Write, Grep, Glob, or Bash tools for implementation work
- **NEVER** write or modify source code, test files, or config files yourself
- **ONLY** use: Agent (to delegate), TaskCreate, TaskUpdate, TaskGet, TaskList, Read (ONLY for specs/ and progress files), Write (ONLY for progress files)
- Your job: create tasks, spawn agents, monitor progress, synthesize results, handle failures
- Keep your context window clean -- delegate all research and exploration

#### Setting Up the Team

Decide the team structure based on the specification's complexity. You are NOT pre-assigned any structure. Analyze the spec and determine:
- How many agents you need
- What each agent's specialty should be
- Which tasks can run in parallel vs. sequentially
- Whether any agents need plan approval before implementing

Example structures (adapt as needed):
- Simple spec: 1 implementer + 1 verifier
- Medium spec: 2-3 parallel implementers + 1 verifier
- Complex spec: researcher + multiple implementers + dedicated test writer + verifier

#### Delegating Work

For each agent you spawn:

1. **Provide full context** in the agent prompt:
   - The exact specification content relevant to their task
   - File paths they need to read and modify
   - What "done" looks like
   - Which tests to run to verify their work
   - The commit message to use

2. **For complex tasks**, require the agent to plan first:
   - Use `subagent_type: "Plan"` for the planning phase
   - Review the plan yourself
   - Then spawn an implementation agent with the approved plan

3. **Run independent agents in parallel** using multiple Agent tool calls in a single message

4. **Run dependent agents sequentially** -- wait for one to complete before spawning the next

#### Monitoring Progress

After each agent completes:
1. Update the task in the task list
2. Update `specs/{nr}-{name}-progress.md` with the result
3. If an agent failed, analyze the failure and either:
   - Spawn a new agent to fix the issue
   - Adjust the approach and re-delegate
4. Spawn the next agent(s) for the next task(s)

#### Verification in Team Mode

After all implementation is done, spawn a dedicated verification agent:

```
Verify the entire implementation of {spec name}:
1. Run: npm test -- all tests must pass
2. Run: npm run lint -- no errors
3. Run: npm run format:check -- all files formatted
4. Run: npm run test:coverage -- check coverage meets spec targets
5. Test any manual scenarios from the spec
6. Report ALL results back. Do NOT fix anything -- just report.
```

If verification finds issues, spawn fix agents for each issue. Then re-verify.

---

## Step 5: Final Verification

Regardless of mode, these checks MUST all pass before declaring done:

1. `npm test` -- all tests pass
2. `npm run lint` -- no errors
3. `npm run format:check` -- consistent formatting
4. `npm run test:coverage` -- coverage meets spec targets (if specified)
5. All test cases from the specification are implemented
6. No known bugs discovered during development remain open

If any check fails, fix the issue and re-verify. Loop until everything passes.

## Step 6: Write Test Plan

Create `specs/{nr}-{name}-testplan.md` with:
- Automated test scenarios (npm test, lint, format, coverage)
- Manual/browser test scenarios for UI changes
- Each scenario: steps, expected result, test type (automated/manual)

## Step 7: Final Commit and Update

1. Ensure all changes are committed
2. Update `specs/{nr}-{name}-progress.md`:
   - Mark all steps as `[x]`
   - Add final verification results
   - Add coverage summary
   - Set status to COMPLETE
3. Push to remote if the user has previously pushed

## Important Rules

- **Task list is mandatory** -- every step must be tracked as a task
- **Progress file must be current** -- update after every completed step
- **Commit after every relevant step** -- not at the end; after EACH meaningful step
- **Never skip verification** -- always run tests/lint/format after changes
- **Fix bugs immediately** -- don't accumulate them
- **Follow the spec exactly** -- don't add features, don't skip features
- **German language** for user-facing strings (matching project convention)
