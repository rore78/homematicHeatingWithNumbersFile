---
name: spec
description: Run an interactive brainstorming session for a feature or epic, then write a full specification. Use when the user wants to spec out a feature, epic, or component from the roadmap.
argument-hint: <epic-number-or-feature-name>
disable-model-invocation: true
---

# Specification Brainstorming Skill

You are running an interactive brainstorming session to produce a full specification for a feature or epic.

## Input

The user provides: `$ARGUMENTS`

This can be:

- An epic number from `specs/roadmap.md` (e.g., "epic 2", "2")
- A feature name not in the roadmap (e.g., "webhook notifications")

## Step 1: Gather Context

1. Read `specs/roadmap.md` to find the epic or understand where the feature fits
2. Read all relevant source files that relate to the feature (use Glob and Read)
3. Read any existing specs in `specs/` to understand prior decisions and patterns
4. If this is an epic from the roadmap, extract its goal, scope, and dependencies

## Step 2: Determine the Spec Number and Name

- If it's an epic from the roadmap, use its number: `{nr}` = epic number, `{name}` = epic name (kebab-case)
- If it's a new feature, use the next available number in `specs/` and a kebab-case name
- Files will be: `specs/{nr}-{name}-brainstorming.md` and later `specs/{nr}-{name}-specification.md`

## Step 3: Brainstorming Rounds

Create `specs/{nr}-{name}-brainstorming.md` and run multiple rounds of questions.

### Rules for Questions

- Ask questions as markdown with checkbox options: `- [ ] **Option** -- Description`
- Mark the recommended option with `(Empfohlen)` in bold text
- Group questions into themed rounds (3-5 questions per round)
- Cover ALL relevant aspects: functionality, UI/UX, data schema, technologies, error handling, edge cases, dependencies, testing strategy
- Use visualizations (ASCII diagrams, tables, Mermaid snippets) when they help clarify options
- Questions and UI are in German (matching the project language)

### Rules for the File

- Only APPEND to the brainstorming file; NEVER modify existing questions or answers
- After writing a round of questions, STOP and wait for the user to answer
- The user will mark their choices with `[X]` directly in the file and may add comments
- Read the file again after each round to see their answers before writing the next round

### Round Structure

Each round should be structured as:

```markdown
---

## Runde {N}: {Theme}

### Frage {N}.{M}: {Title}

{Context or visualization if useful}

- [ ] **Option A** (Empfohlen) -- Description with rationale
- [ ] **Option B** -- Description with rationale
- [ ] **Option C** -- Description with rationale (if applicable)
```

### Final Round

The last question in the final round must always be:

```markdown
### Frage {N}.{M}: Soll es noch weitere Fragen geben, oder sind alle Aspekte abgedeckt?

- [ ] **Alles klar, schreibe die Spezifikation** -- Alle Entscheidungen sind getroffen.
- [ ] **Weitere Fragen** -- Ich habe noch offene Punkte (bitte als Kommentar angeben).
```

## Step 4: Write the Specification

Once the user selects "Alles klar, schreibe die Spezifikation":

1. Read the entire brainstorming file to collect all decisions
2. Write `specs/{nr}-{name}-specification.md` containing:
   - **Zusammenfassung der Entscheidungen** -- Table of all decisions made
   - Detailed specification sections organized by topic
   - Implementation details with code examples where useful
   - **Implementierungsreihenfolge** -- Ordered steps with a Mermaid diagram
   - **Commit-Strategie** -- Suggested commit sequence
   - **Definition of Done** -- Checklist of acceptance criteria

## Important

- Do NOT start any implementation. This skill is ONLY about brainstorming and writing the spec.
- Do NOT write code files. Only write markdown files in `specs/`.
- Keep the conversation focused on decisions, not implementation details.
- Reference existing code patterns and decisions from prior specs when relevant.
