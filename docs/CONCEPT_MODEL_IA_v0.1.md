# Grand Bazaar Companion — Concept Model / IA v0.1

Status: **DESIGN DRAFT / IMPLEMENTATION FREEZE**
Date: 2026-10-01

## 1. Product thesis

This app is not a generic task manager and not a game encyclopedia.

It is a **personal strategy layer on top of the game world**:

1. record what the player has learned or currently owns,
2. understand game-side objectives and events,
3. decide what the player wants to accomplish,
4. turn that into concrete requirements and actions,
5. surface only what matters now.

The product should preserve the distinction between **game facts**, **player intentions**, and **execution**.

---

## 2. Finding from the old “目標” UI

The old design felt good because it kept three concepts separate:

- **目標 / 計画** — the state the player wants to achieve
- **必要なもの** — resources or conditions required to achieve it
- **やること** — executable actions

Example:

> ピザを8個作る  
> 必要なもの: 小麦粉 2/4, チーズ 1/2  
> やること: 小麦を収穫する, チーズを作る, ピザを焼く

This is semantically stronger than modeling every nested item as a subtask.

### What v0.8.x accidentally collapsed

The ToDo-first experiment conflated:

- a standalone task,
- a plan container,
- child tasks,
- and progress requirements.

Structural complexity (“has children”) was used to infer semantic meaning (“is a plan”).

That inference is not generally valid. A task can have a checklist without becoming a plan, and a plan can exist before it has child tasks.

**Decision:** restore explicit conceptual boundaries.

---

## 3. Core domain model

### Player-created objects

#### Capture / Memo
Unstructured thought.

Purpose:
- capture first,
- decide later whether it becomes a ToDo or Plan,
- no forced structure.

#### Task
A concrete executable action.

Examples:
- フェリペの店を見る
- チーズを作る
- 牛を買う

A Task can be:
- standalone = shown to the user as **ToDo**
- linked to a Plan = shown inside that Plan as **やること**

These are the **same semantic object** in different contexts.

#### Plan
A container for achieving a desired outcome.

A Plan owns:
- zero or more Requirements
- zero or more Tasks
- optional References to game-world Sources

A Plan does **not** need a season field by default.

#### Requirement
A resource or condition needed by a Plan.

Typical fields:
- item / label
- needed quantity
- current quantity
- quality condition

A Requirement is not a Task.

---

### Game-world objects

These are game facts or game-side objectives, not user Tasks.

#### Resident Wish
Master-data-backed game objective.

Properties may include:
- resident
- sequence/stage
- unlock condition
- request text
- required items
- reward

Spoiler rule:
- only the currently revealed stage is shown,
- later stages remain hidden until the user explicitly marks the previous stage as cleared.

#### Bazaar Event
A dated game event.

It may be referenced by a Plan, but the Bazaar itself is not a Plan.

#### Recipe
Game knowledge / recipe master data.

A Recipe may generate or support a Plan, but the Recipe itself is not a Plan.

#### Item / Crop / Process
Game-world knowledge and player-state records.

---

## 4. Relationship model

```
GAME WORLD
Resident Wish ─┐
Bazaar Event ──┼── Reference / Source ──> Plan
Recipe ────────┘                         │
                                        ├── Requirement
                                        └── Task
                                             │
                                             └── executable action

PLAYER
Capture ──> Task (standalone = ToDo)
        └─> Plan

Task ──(optional explicit promotion)──> Plan
```

Key rule:

**Resident Wish / Bazaar / Recipe describe WHY or WHERE the work comes from.  
Plan / Task describe HOW the player will act.**

---

## 5. Promotion model

### Do not make automatic promotion a core rule

“has subtask => becomes Plan” is rejected as a domain rule.

Reasons:
- a checklist is not automatically a Plan,
- it makes object identity unstable,
- it forces UI terminology to change based on structure,
- it creates hidden behavior that users must learn.

### Preferred interaction

A standalone ToDo may offer:

> 計画にする

Promotion should be:
- one action,
- reversible where practical,
- preserve the original text,
- create a Plan and place the original Task appropriately.

The system may **suggest** promotion when the user needs structure, but should not infer it silently from one implementation detail.

---

## 6. Information architecture

### Recommended navigation concept

Use **作戦** as the navigation-level concept.

Reason:
- the screen contains both Plans and standalone ToDos,
- “ToDo” is too narrow for the whole screen,
- “計画” is too narrow if standalone Tasks coexist,
- “作戦” matches the product’s role without defining a data type.

### 作戦 screen

```
作戦

計画                           ＋
────────────────────────────
📋 ピザを8個作る
   必要なもの 1/2 ・ やること 2/3

📋 次のバザールに向けて準備
   関連: 次のバザール


ToDo                          ＋
────────────────────────────
□ フェリペの店を見る
□ 牛を買う
```

This restores the clarity of the original “目標 / やること” layout without forcing every new input through one object type.

---

## 7. Plan detail

The standard Plan detail should have a consistent skeleton:

```
📋 ピザを8個作る

関連
料理: ピザ                    (only when relevant)

必要なもの                    ＋
────────────────────────────
小麦粉           現在 2 / 必要 4
チーズ           現在 1 / 必要 2

やること                      ＋
────────────────────────────
□ 小麦を収穫する
□ チーズを作る
□ ピザを焼く
```

The two-section structure is foundational.

Context-specific plans may change labels only where semantics genuinely differ.

Example:
- Bazaar-linked tracked sell items may display as **出品予定**
- normal material requirements remain **必要なもの**

Do not use decorative type chips as the primary explanation of structure.

---

## 8. Resident Wish model

Resident Wish should remain a separate game-side feature.

Flow:

1. user searches/selects resident by predictive name lookup,
2. app shows only Wish stage 1,
3. user marks it “ゲーム内で達成”,
4. stage 2 becomes revealable,
5. user may choose **作戦に追加**,
6. app creates a Plan linked back to that Wish.

Generated Plan may prefill:
- Requirements from master data,
- title/context from the Wish.

The Wish remains the source of truth for game-side content.
The Plan remains the source of truth for player execution.

This avoids forcing spoiler-sensitive master data into generic ToDo records.

---

## 9. Bazaar model

Bazaar is an Event / Context.

A player can:
- create a Plan linked to the next Bazaar,
- track sell targets,
- add ordinary Tasks.

Do not model “Bazaar” as a Plan type.

The link should be presented as a relationship, e.g.:

> 関連: 次のバザール

not as a permanent visual badge taxonomy.

---

## 10. Terminology

### Provisional user-facing vocabulary

- Navigation: **作戦**
- Container: **計画**
- Standalone Task: **ToDo**
- Task inside Plan: **やること**
- Resource/condition: **必要なもの**
- Source relationship: **関連**
- Unstructured capture: **メモ**

Important:
“ToDo” and “やること” are the same underlying Task concept.
The label changes because context changes.

This is acceptable when the navigation itself is not named “ToDo”.

---

## 11. Design principles

1. **Concept before convenience**  
   Do not merge distinct concepts only to reduce taps.

2. **Game world ≠ player execution**  
   Wish, Bazaar, Recipe, Resident, Item are source/context data.

3. **Requirement ≠ action**  
   “何が必要か” and “何をするか” must remain visually and structurally distinct.

4. **Progressive disclosure**  
   Especially for spoiler-sensitive Wish data.

5. **No taxonomy UI unless useful**  
   Avoid badges/chips for internal kinds.

6. **Stable objects**  
   An object should not silently change semantic type because a child record was added.

7. **Quick capture stays quick**  
   Memo remains unstructured and independent.

8. **One screen should answer one question**  
   List: “what is active?”  
   Plan detail: “what is missing and what should I do?”  
   Home: “what matters now?”

---

## 12. Current implementation mapping

The current implementation should be treated as an experiment, not the final model.

Existing data can be mapped later:

- `goals` -> candidate Plans
- `requirements[goalId]` -> Plan Requirements
- `actions[goalId]` -> Plan Tasks
- standalone `actions` -> standalone Tasks / ToDos
- v0.8.x standalone actions with `children` or `requirements[actionId]` -> migration candidates to explicit Plans
- request/bazaar `kind` values -> migrate toward Source / Reference relationships

No migration should be implemented until the interaction design is approved.

---

## 13. Validation scenarios before implementation

A prototype must support these five scenarios coherently.

### A. One-off task
“フェリペの店を見る”

Expected:
- create as ToDo,
- no Plan UI required.

### B. Multi-step personal objective
“ピザを8個作る”

Expected:
- Plan with Requirements and Tasks,
- shortages understandable at a glance.

### C. Resident Wish
Expected:
- resident lookup,
- spoiler-safe staged reveal,
- optionally generate linked Plan.

### D. Next Bazaar
Expected:
- Bazaar is a dated context,
- linked Plan can contain sell targets + Tasks.

### E. Recipe-driven production
Expected:
- Recipe remains game knowledge,
- player may generate a Plan from it,
- ingredient requirements can be prefilled.

If one conceptual model handles all five without special-case terminology everywhere, it is ready for implementation.

---

## 14. Implementation gate

**Do not modify production UI yet.**

Next deliverable:
1. low-fidelity screen architecture for the five scenarios,
2. terminology check across all screens,
3. migration plan from current v0.8.1,
4. only then implementation.

