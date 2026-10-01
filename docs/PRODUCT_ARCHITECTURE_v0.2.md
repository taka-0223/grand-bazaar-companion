# Grand Bazaar Companion — Product Architecture v0.2

Status: **DESIGN BASELINE / IMPLEMENTATION FREEZE**
Date: 2026-10-01

This document consolidates:
- the original product behavior,
- the old “目標 / 必要なもの / やること” UX,
- the v0.8.x ToDo-first experiment,
- Concept Model / IA v0.1,
- UX Architecture v0.1,
- Claude's independent design review.

It replaces the v0.1 architectural framing where they conflict.

---

## 1. Product thesis

Grand Bazaar Companion is not a generic task manager and not a game wiki.

It is a **personal planning layer that uses only information the player has already discovered, combines that with the player's current state and game time, and helps reverse-plan the next useful actions.**

Core promise:

> **既知の情報と今の状態から、次に何をすればいいかを逆算する。**

This is the product-specific value that must not disappear when the UI is simplified.

---

## 2. Product architecture

The system is not a simple linear stack. It has four persistent domains plus a cross-cutting time axis and a derived focus layer.

```
MASTER WORLD
(hidden complete game data)
        │
        ▼
DISCOVERY / KNOWN
(what this player has actually discovered or explicitly revealed)
        │
        ├──────────────┐
        ▼              ▼
PLAYER STATE        PLAYER INTENT
inventory/state     goals/tasks/requirements
progress            player decisions
        │              │
        └──────┬───────┘
               ▼
        DERIVATION / REVERSE PLANNING
        shortages / production chains /
        suggested next actions / timing
               │
               ▼
              FOCUS
        “what matters now?”
```

**TIME** crosses Discovery, State, Intent, Derivation and Focus.

**MEMO / CAPTURE** is an input channel outside the model. It can later be connected to an object without requiring classification at capture time.

---

## 3. Architecture layers

### 3.1 Master World

Complete game-side knowledge.

Examples:
- residents,
- resident wishes,
- items/crops,
- recipes,
- processing transformations,
- events,
- calendars,
- rewards,
- unlock conditions.

Master data may contain spoilers and is not automatically visible.

---

### 3.2 Discovery / Known

The visibility boundary between the full game world and this player's experience.

Examples:
- known items,
- known recipes,
- known production methods,
- known residents,
- explicitly revealed wish content,
- user-recorded facts.

This is a first-class product concept.

**Spoiler safety is a global Discovery rule, not a Resident Wish special case.**

General rule:

> Master data can exist internally before it becomes visible, but every surface must pass through Known / Revealed state.

Autocomplete, recommendations, reverse planning and search must respect the same rule.

---

### 3.3 Player State

Current facts about this playthrough.

Separate sub-domains:

#### Inventory / operational state
- quantity,
- quality,
- storage location,
- growing/processing state,
- facility state.

#### Progress
- current game date,
- known/revealed wish progress,
- cleared stages,
- event occurrence/completion.

#### Player annotations
Free notes tied to known entities may exist, but should not create multiple competing generic note systems.

---

### 3.4 Player Intent

What the player wants to accomplish.

#### Goal — 目標
Desired outcome.

Fields:
- title,
- status,
- blocked reason when relevant,
- references/relationships,
- lifecycle.

Recommended statuses retained from the old UI:
- active,
- someday,
- blocked (+ reason),
- done.

A Goal does not have a generic season field.

#### Task — やること
Concrete executable action.

Fields:
- text,
- completed,
- pinned / 今やる,
- optional goalId,
- optional references.

A Task remains the same entity whether it is standalone or attached to a Goal.

**There is no separate ToDo entity.**
**There is no promotion state.**
**There are no child tasks unless future usage proves a real need.**

#### Requirement / Target — 必要なもの
Resource or measurable condition associated with a Goal.

Fields may include:
- entity reference or free label,
- needed quantity,
- quality condition,
- source/provenance,
- current value strategy.

Requirement is not an action.

---

## 4. Reverse-planning layer

Reverse planning is a core product capability, not a UI bonus.

Inputs:
- Known production/recipe graph,
- Goal,
- Requirements,
- Player State,
- Time.

Outputs can include:
- shortages,
- required intermediate materials,
- production steps,
- candidate Tasks,
- timing warnings,
- “can do now” / “blocked by” signals.

Example:

```
Goal: ピザを8個作る
        │
        ▼
Known recipe for ピザ
        │
        ├─ Requirement: 小麦粉 ×16
        ├─ Requirement: トマト ×8
        └─ Requirement: チーズ ×8
                │
                ▼
Known processing chains
                │
                ▼
Suggested actions
- 小麦を収穫する
- チーズを加工する
- ピザを作る
```

Suggested actions should remain user-controlled:
- preview,
- add selected,
- add all.

Do not silently create large task trees.

---

## 5. Time is a cross-cutting axis

Time is central to Grand Bazaar gameplay.

Relevant dimensions:
- year,
- season,
- day,
- weekday,
- next Bazaar instance,
- festivals,
- birthdays,
- crop availability,
- deadlines/unlock timing.

Time should not be implemented as a generic field on every Goal.

Instead:
- events are concrete dated objects,
- Goals may reference a specific event instance,
- Focus derives urgency from current date + linked dates,
- production feasibility can use known seasonal constraints.

### Bazaar rule

A Goal links to a **specific Bazaar occurrence**, not the moving concept “next Bazaar”.

Example:
- Bazaar instance: Year 1 / Autumn / Day 7.

After the event passes, the app may offer:
- archive,
- carry remaining targets to the next occurrence.

It must not silently retarget history to the next Bazaar.

---

## 6. Stable user-facing vocabulary

Recommended baseline:

| Concept | UI label |
|---|---|
| Workspace tab | 計画 |
| Desired outcome | 目標 |
| Task | やること |
| Resource / measurable condition | 必要なもの |
| External/game-world relationship | 関連 |
| Unstructured capture | メモ |

### Remove from baseline vocabulary

- ToDo
- 作戦 as a tab label
- 昇格 / 格上げ
- サブタスク as a primary abstraction

Reason:

The old UI already had a coherent vocabulary:
- 計画 = workspace,
- 目標 = outcome,
- やること = action.

The v0.8 terminology collision was introduced by the experiment, not inherited from the original design.

---

## 7. Core Planning workspace

The Planning screen should restore the old global structure.

```
計画

目標                                      ＋
────────────────────────────────
🎯 ピザを8個作る                         ›
   必要なもの 1/3

🎯 次回バザールの商品をそろえる          ›
   関連：秋7日のバザール


やること                                  ＋
────────────────────────────────
□ 小麦を収穫する
   ピザを8個作る

□ フェリペの店を見る

□ チーズを加工する
   ピザを8個作る
```

Key property:

**All active Tasks remain visible in one cross-goal list.**

Goal membership is an attribute, not a different task type.

---

## 8. Goal detail

Canonical Goal detail:

```
‹ 計画

🎯 ピザを8個作る                         編集
進行中

関連
料理：ピザ                               ›

必要なもの                               ＋
────────────────────────────────
小麦粉 ★2以上
現在 2                         必要 4
                         [ − ] [ ＋ ]

チーズ
現在 1                         必要 2
                         [ − ] [ ＋ ]


やること                                 ＋
────────────────────────────────
□ 小麦を収穫する                         ☆
□ チーズを加工する                       ★
□ ピザを作る                             ☆

料理から逆算
────────────────────────────────
不足と候補工程を確認                     ›
```

The old two-section structure is foundational.

A Goal can be:
- active,
- someday,
- blocked,
- done.

---

## 9. Task interaction

Standalone Task and Goal-linked Task are the same object.

Task edit may include:

```
やること

内容
[ 小麦を収穫する ]

関連する目標
[ ピザを8個作る ▼ ]

★ 今やる
```

Changing the Goal relation:
- does not transform the Task,
- does not rename it,
- is reversible,
- requires no migration concept.

### Creating a Goal from a Task

Avoid “目標にする”.

Instead offer:
- **目標に入れる**
- **このための目標を作る**

If a new Goal is created from the Task:
- Task remains intact,
- new Goal title is explicitly edited as an outcome,
- Task becomes its first linked action.

---

## 10. Requirements and inventory state

Current quantity should not be blindly duplicated.

Preferred strategy:

### If an authoritative player-state quantity exists
Derive current amount from Player State.

### If the app does not track that quantity
Allow manual current amount.

### If both are needed
Display provenance and allow an explicit local override only when necessary.

This avoids inconsistent duplicate counters without pretending the app tracks every inventory type.

---

## 11. Production knowledge

Cooking and processing share one domain shape:

```
inputs → method/facility → output
```

Internally they should converge toward a general **Production Method / 作り方** model.

User-facing surfaces may still distinguish:
- 料理,
- 風車加工,
- other future production systems.

The domain unification exists to enable multi-step reverse planning.

---

## 12. Resident Wishes

Resident Wish requires three separate concepts.

### Wish Master
Game-side content:
- resident,
- request text,
- requirements,
- reward,
- unlock conditions,
- sequence metadata.

### Wish Progress
Player-side state:
- known/revealed,
- accepted/seen,
- completed,
- spoiler/reveal permissions.

### Goal
Optional player execution plan generated from a revealed Wish.

### Spoiler rules

1. resident autocomplete only uses **known residents**,
2. hidden wish stages never appear in autocomplete/search,
3. avoid public stage numbering if it reveals sequence length,
4. request content can be revealed after the player confirms they encountered it,
5. reward can use a separate explicit reveal control,
6. unlock hints require stronger explicit reveal consent,
7. all other knowledge features use the same Discovery policy.

---

## 13. Home / Focus

Home is a derived projection, not a second Planning screen.

Primary question:

> **今、何を見ればいい？**

Candidate sections:

```
⭐ 今やる
□ チーズを加工する
□ フェリペの店を見る

不足
小麦粉       2 / 4     ピザを8個作る

近い予定
🎪 秋7日 バザール      あと3日

未整理メモ
2件
```

Do not automatically duplicate all Goal cards on Home.

Goal information appears only when it creates an actionable Focus signal.

---

## 14. Navigation principle

Tabs represent recurring **workspaces**, not every domain object.

Current strong candidates:
- ホーム
- 種管理
- 計画

Knowledge navigation needs further testing.

### Candidate: 図鑑 / 知る workspace

Could eventually contain:
- 料理,
- 加工,
- 住人,
- other known game knowledge.

However, **do not create this tab solely for architectural elegance**.

Open question:
- Does the current product have enough knowledge surfaces to justify a combined discovery workspace now?

Memo tab is also unresolved:
- quick capture via FAB is important,
- memo review/archive may or may not deserve a permanent tab.

Navigation is therefore intentionally not frozen in v0.2.

---

## 15. Free-text rule

Generic unstructured content should converge on Memo / Capture.

Entity-specific notes may exist as annotations, but every new feature should not invent its own generic note field.

Before adding a free-text field, ask:
- is this structured state?
- is this an annotation on an entity?
- or is this just a Memo with a relationship?

---

## 16. Explicit removals from the v0.8 experiment

Remove from target architecture:

- ToDo as a separate UI concept,
- automatic ToDo → Plan conversion,
- explicit object “promotion”,
- Task children,
- Task-owned Requirement collections,
- Plan/Goal kinds for request / bazaar / recipe,
- moving `systemKey: next_bazaar` semantics,
- type-driven UI taxonomy chips.

Existing v0.8.x data will require migration, but migration convenience must not define the model.

---

## 17. Guardrails

1. **Known before shown**  
   Every master-data surface passes through Discovery.

2. **Requirement ≠ Task**  
   Resource state and actions stay separate.

3. **One Task entity**  
   Standalone and Goal-linked tasks are the same object.

4. **Goal relation, not Goal type**  
   Wish/Bazaar/Recipe/Production are references.

5. **Specific event instances**  
   Time-sensitive references do not silently move.

6. **Reverse planning is core**  
   New design work must preserve or improve the “逆算” capability.

7. **One source of truth for quantities when possible**  
   Do not create duplicate counters casually.

8. **Tabs are workspaces**  
   Domain growth must not create endless tabs.

9. **Stable objects and stable words**  
   Adding a relation does not rename or transform an object.

10. **Home is derived Focus**  
    Home does not become a second copy of every feature.

---

## 18. Open questions for real-use validation

1. Which factor made the old UI feel best:
   - flat cross-goal Task list,
   - Goal detail hierarchy,
   - reverse-planning assistance,
   - Goal statuses,
   - all of the above?

2. Should Memo remain a tab or become FAB + review surface?

3. Is a combined 図鑑 / 知る workspace useful now, or premature?

4. For Requirements, which quantities can be reliably derived from existing player state?

5. When a recipe quantity changes, should generated Requirements remain live-derived or become editable snapshots?

6. How much reverse-planning automation is helpful before it becomes intrusive?

7. How should completed Goals/Tasks be reviewed or archived?

8. Is an extra reveal tap for Wish rewards reassuring or annoying in practice?

---

## 19. Next implementation gate

Do not implement new Resident Wish data yet.

Next engineering step should be a controlled reconstruction of the original Planning semantics:

1. restore **計画 / 目標 / やること** vocabulary,
2. restore the flat global Task list,
3. restore Goal status,
4. remove ToDo promotion/children semantics,
5. preserve Requirement and Goal detail behavior,
6. keep current data through a reversible migration,
7. preserve existing reverse-planning features,
8. only after real-play validation, add Source relationships and global Discovery architecture.

