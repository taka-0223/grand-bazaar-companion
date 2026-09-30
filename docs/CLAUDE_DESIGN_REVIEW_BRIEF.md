# Claude Design Review Brief — Grand Bazaar Companion

## Your role

Act as a senior product designer / information architect / domain model reviewer.

Do **not** optimize for agreeing with the current design.
Your job is to identify structural flaws, conceptual conflation, hidden UX costs, terminology problems, and future scaling risks.

The product is a mobile-first personal companion for *Story of Seasons: Grand Bazaar*.
It is not intended to be a generic productivity app and not intended to be a full攻略Wiki.

The user has already noticed that incremental feature-by-feature changes caused the design to shrink around the latest idea and lose conceptual consistency. This review exists specifically to prevent that.

## What to review

Review the following two design artifacts as one system:

1. Concept Model / IA
2. Low-Fidelity UX Architecture

Assess them against the product as a whole, not only the “strategy/task” feature.

Important product areas include:

- Home / focus
- Memo / capture
- Crops, seeds, seedlings, mushrooms
- Player-owned state such as quality, quantity, growing state, storage location
- Recipes and processing knowledge
- Calendar / game date / Bazaar events / birthdays
- Residents
- Resident Wishes, including strict spoiler-safe staged reveal
- Strategy / Goal / Requirement / Task / ToDo
- Future ability to connect master game data to player execution

## Review questions

Please answer all of these.

### A. Product architecture

1. Is the proposed framing — game-world knowledge → player state → strategy → focus, with Memo as capture — coherent?
2. Are any layers missing, redundant, or incorrectly separated?
3. Which current features are incorrectly placed in that architecture?
4. Does this architecture still make sense when the app grows beyond the current features?

### B. Domain model

Evaluate these proposed objects:

- Memo / Capture
- Goal
- Requirement
- Task
- Resident Wish
- Bazaar Event
- Recipe
- Item / Crop / Process

For each:
- is it truly a distinct concept?
- what owns it?
- what can reference it?
- what state belongs to it?
- what should *not* belong to it?

Pay special attention to whether:
- standalone ToDo and Goal-linked “やること” should be one Task entity,
- Goal is the right abstraction,
- Requirement is sufficiently general,
- Wish / Bazaar / Recipe should be Sources / References rather than Goal types.

### C. Terminology

Current terminology under test:

- navigation/workspace: 作戦
- outcome container: 目標
- standalone task: ToDo
- task inside a goal: やること
- resource/condition: 必要なもの
- external source relationship: 関連
- unstructured capture: メモ

Evaluate this as Japanese mobile UI copy, not only as abstract semantics.

In particular:
- Is “作戦” too broad or too game-like?
- Is “目標” better than “計画”?
- Is using “ToDo” outside a Goal and “やること” inside a Goal understandable or artificial?
- Is there a cleaner terminology system that preserves conceptual clarity without sounding like project-management software?

### D. Interaction model

Review these key flows:

1. quick Memo capture
2. standalone one-off task
3. multi-step personal objective
4. Resident Wish → optional strategy creation
5. Bazaar Event → optional strategy creation
6. Recipe → optional strategy creation
7. Home showing only “what matters now”

Check whether the design asks users to classify too early or hides important structure too late.

### E. The old “目標” UX

The previous implementation had:

- 目標
  - 必要なもの
  - やること

Users reported that this felt better than later ToDo-first experiments.

Explain *why* this interaction may have felt better from:
- information architecture,
- cognitive load,
- progressive disclosure,
- object stability,
- visual hierarchy,
- mental-model alignment.

Do not simply accept the current explanation; challenge it.

### F. Automatic promotion

A recent experiment automatically promoted a ToDo into a Plan when sub-items were added.

The current design draft rejects that as a domain rule and proposes explicit “目標にする”.

Evaluate:
- whether explicit promotion is actually better,
- whether automatic promotion can be retained safely as a UI convenience without corrupting the domain model,
- whether the product should avoid the concept of “promotion” entirely.

### G. Resident Wish / spoiler design

The desired behavior is:

- select resident via predictive lookup,
- initially reveal only the first Wish stage,
- later stages stay hidden,
- clearing one stage allows the user to reveal the next,
- a revealed Wish can generate a strategy/Goal,
- master data remains distinct from player-created execution data.

Review this carefully.
Suggest a model that prevents accidental spoilers while still feeling delightful.

### H. Navigation and screen architecture

The current bottom nav is approximately:

- Home
- Seeds / Crops
- Recipes
- Strategy
- Memo

Residents and Calendar are currently not necessarily first-class tabs.

Evaluate:
- whether this navigation reflects the true product architecture,
- whether some concepts belong as cross-linked surfaces rather than tabs,
- whether Home should include Goals or only derived focus,
- whether “Strategy” should be a destination or a cross-cutting layer.

### I. Failure modes

List the top 5 ways this product could become confusing or bloated over the next 3–5 feature additions.

For each, give a guardrail.

### J. Verdict

Finish with:

- KEEP: concepts that are structurally sound
- MODIFY: concepts that need adjustment
- REMOVE: concepts that should not survive
- OPEN QUESTIONS: unresolved design choices that genuinely need user testing

Do not propose implementation yet.
Do not write code.
Do not optimize around the current database schema.
Prioritize conceptual integrity over migration convenience.

---

# Artifact 1 — Concept Model / IA

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



---

# Artifact 2 — Low-Fidelity UX Architecture

# Grand Bazaar Companion — Low-Fidelity UX Architecture v0.1

Status: **PROTOTYPE SPEC / NO PRODUCTION IMPLEMENTATION**
Date: 2026-10-01

This document tests the Concept Model against representative user flows.
No production UI should be changed from this document alone.

---

## 1. Terminology under test

For this prototype, use:

- Navigation: **作戦**
- Desired outcome container: **目標**
- Standalone executable Task: **ToDo**
- Task linked to a Goal: **やること**
- Resource / condition: **必要なもの**
- Game-world linkage: **関連**
- Unstructured capture: **メモ**

Why “目標” is being retested:
- it names the desired outcome rather than the implementation structure,
- “必要なもの” and “やること” naturally explain how to reach it,
- it avoids making “計画” compete with the plan-like structure created by those sections.

Internal architecture can call this entity Objective regardless of final Japanese label.

---

## 2. Navigation-level IA

Recommended bottom navigation remains compact:

```
ホーム | 種・苗 | 料理 | 作戦 | メモ
```

The important change is conceptual:

**作戦** is a workspace, not a data type.

It can therefore contain both:
- 目標
- ToDo

---

## 3. 作戦 screen

```
作戦
ゲームで次に進めたいことをまとめる

目標                                      ＋
────────────────────────────────
🎯 ピザを8個作る                         ›
   必要なもの 1/2 ・ やること 2/3

🎯 バザール用の商品をそろえる             ›
   関連：次のバザール
   出品予定 3件 ・ やること 1/2


ToDo                                     ＋
────────────────────────────────
□ フェリペの店を見る                     ☆
□ 牛を買う                               ★
```

Design intent:
- no type chips,
- no “request / bazaar / recipe” taxonomy in the list,
- relationship appears only when it adds meaning,
- Goal and ToDo are visually distinct sections.

---

## 4. Creating a ToDo

Tap `＋` beside ToDo:

```
ToDoを追加

内容
[ フェリペの店を見る                    ]

☆ 今やる

                    キャンセル   保存
```

No:
- season,
- source selector,
- subtask editor,
- requirement editor.

A ToDo should remain lightweight.

### Existing ToDo detail

```
フェリペの店を見る

☆ 今やる

[ 目標にする ]

編集                                   削除
```

“目標にする” is an explicit transition.
It is not triggered by hidden structural rules.

---

## 5. Promoting a ToDo to a Goal

Tap `目標にする`.

Result:

```
🎯 フェリペの店を見る

必要なもの                              ＋
────────────────────────────────
まだありません

やること                                ＋
────────────────────────────────
まだありません
```

The original wording is preserved as the Goal title.

The object is now stable:
- adding/removing Requirements does not change its type,
- adding/removing Tasks does not change its type,
- it does not silently downgrade.

Optional later UX:
- “ToDoに戻す” only when the Goal has no Requirements, Tasks, or References.

---

## 6. Creating a Goal directly

Tap `＋` beside 目標:

```
目標を追加

目標
[ ピザを8個作る                         ]

                    キャンセル   作成
```

After creation, open the Goal detail.

Do not ask for:
- type,
- season,
- request/bazaar label,
- status taxonomy,
- requirements at creation time.

Structure is added in the detail screen when needed.

---

## 7. Standard Goal detail

```
‹ 作戦

🎯 ピザを8個作る                       編集

関連
料理：ピザ                              ›

必要なもの                              ＋追加
────────────────────────────────
小麦粉
現在 2                         必要 4
                         [ − ] [ ＋ ]

チーズ ★2以上
現在 1                         必要 2
                         [ − ] [ ＋ ]


やること                                ＋追加
────────────────────────────────
□ 小麦を収穫する                       ☆
□ チーズを作る                         ★
□ ピザを焼く                           ☆
```

This is the canonical interaction pattern.

The screen answers:
1. What am I trying to achieve?
2. What am I missing?
3. What should I do?

---

## 8. Resident Wish flow

Resident Wish is not created inside the Goal editor.

### Entry A: Resident card

```
ユリス

誕生日：秋20日

願いごと
────────────────────────────────
願いごと 1
[ ゲーム内で発生した ]
```

Before reveal, content remains hidden.

After confirming it has occurred:

```
ユリス

願いごと 1
────────────────────────────────
（ゲーム内の願いごと内容）

必要
・○○ ×1
・△△ ×2

報酬
・□□

[ 作戦に追加 ]
[ ゲーム内で達成 ]
```

After “ゲーム内で達成”:

```
✓ 願いごと 1

次の願いごと
[ ゲーム内で発生した ]
```

The next stage content is not automatically exposed.

### Resident predictive lookup

Where a resident needs to be selected:

```
住人
[ ユリ                     ]

候補
ユリス
```

Only resident names are searched.
The lookup must not reveal later Wish stages in autocomplete.

---

## 9. Wish -> Strategy

Tap `作戦に追加` from a revealed Wish.

The app creates:

```
🎯 ユリスの願いごと 1

関連
ユリス：願いごと 1                      ›

必要なもの
────────────────────────────────
○○                         0 / 1
△△                         0 / 2

やること
────────────────────────────────
まだありません
```

Master data can prefill Requirements.

Important:
- the Resident Wish remains the authoritative game record,
- the Goal is the player's execution layer,
- editing Goal Requirements does not rewrite the master Wish.

---

## 10. Bazaar flow

Bazaar is a calendar/event object.

### Home / calendar entry

```
次のバザール
秋 7日・あと3日

[ 関連する作戦を見る ]
```

If no linked Goal exists:

```
次のバザール

[ 目標を作る ]
```

Created Goal:

```
🎯 次のバザールに向けて準備

関連
次のバザール                            ›

出品予定                                ＋追加
────────────────────────────────
ピザ                          3 / 8
チーズ                        2 / 5

やること                                ＋追加
────────────────────────────────
□ ピザを作る
□ 商品を倉庫から出す
```

Underlying model can reuse requirement-like item tracking,
but the UI label “出品予定” is valid because the semantic role is different.

The Bazaar itself is still not a Goal type.

---

## 11. Recipe flow

Recipe detail:

```
🍳 ピザ

材料
・小麦粉 ×2
・トマト ×1
・チーズ ×1

[ 作戦に追加 ]
```

Tap “作戦に追加”:

```
何個作る？
[ 8 ]

[ 目標を作る ]
```

Generated Goal:

```
🎯 ピザを8個作る

関連
料理：ピザ

必要なもの
────────────────────────────────
小麦粉                     current / needed
トマト                     current / needed
チーズ                     current / needed

やること
────────────────────────────────
必要に応じて自分で追加
```

Recipe is knowledge.
Goal is intention.
Requirement is tracking.
Task is execution.

---

## 12. Memo flow

Memo remains completely generic.

```
📝 メモ

[ 思いついたことをそのまま              ]

                              メモ保存
```

Later from Memo:

```
ピザ多めに作っとく

[ ToDoにする ]
[ 目標にする ]
[ アーカイブ ]
```

This is the one place where both conversion destinations are useful,
because a Memo has intentionally undefined semantics.

---

## 13. Home contract

Home should not duplicate the entire 作戦 screen.

It answers only: **what matters now?**

Suggested hierarchy:

```
ホーム

⭐ 今やる
────────────────────────────────
□ チーズを作る
□ フェリペの店を見る

不足
────────────────────────────────
小麦粉          2 / 4       ピザを8個作る
チーズ          1 / 2       ピザを8個作る

近いイベント
────────────────────────────────
🎪 次のバザール   あと3日

未整理メモ
────────────────────────────────
2件
```

Goal cards belong primarily in 作戦, not automatically duplicated in Home.

---

## 14. Terminology audit

### Works

**作戦**
- workspace umbrella,
- accommodates Goal + ToDo + game-source relationships.

**目標**
- desired outcome,
- naturally owns Requirements + Tasks.

**必要なもの**
- clearly non-action state/resource tracking.

**やること**
- concrete executable work inside a Goal.

**ToDo**
- recognizable shorthand for standalone Task.

**関連**
- describes Wish/Bazaar/Recipe linkage without taxonomy chips.

### Avoid

- “計画” as both screen and entity while ToDo also exists,
- “サブタスク” as the main planning abstraction,
- “種類” selector for Wish/Bazaar/Recipe,
- permanent badges for internal kinds,
- common “季節” field on Goal.

---

## 15. Interaction invariants

These rules should survive future feature additions.

1. A ToDo never changes type silently.
2. A Goal does not downgrade because it becomes empty.
3. Requirements and Tasks are never merged.
4. Wish/Bazaar/Recipe are References, not Goal subclasses.
5. Master game data is not mutated by player planning edits.
6. Spoiler-sensitive data is revealed only through explicit player progress.
7. Quick capture does not ask the user to classify first.
8. Navigation labels describe workspaces, not storage schemas.

---

## 16. Five-scenario consistency result

### A. One-off task
Fits ToDo with no extra structure.

### B. Multi-step production
Fits Goal + Requirements + Tasks.

### C. Resident Wish
Fits Game Source -> Goal generation with spoiler gate.

### D. Bazaar
Fits Event Source -> Goal with context-specific tracked items.

### E. Recipe
Fits Knowledge Source -> Goal generation.

No scenario requires a new top-level task type.

**Result: the model is coherent enough to prototype visually.**

---

## 17. Next gate

Before production implementation:

1. compare this low-fi structure against the live v0.8.1 app,
2. decide whether user-facing “目標” wins over “計画”,
3. define migration from current v0.8.x experimental records,
4. implement the smallest coherent slice,
5. test it with real game play before adding Resident Wish master data.

