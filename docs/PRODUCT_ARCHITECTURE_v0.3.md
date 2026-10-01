# Grand Bazaar Companion — Product Architecture v0.3

Status: **CURRENT DESIGN BASELINE / IMPLEMENTATION FREEZE**
Date: 2026-10-01

This document supersedes `PRODUCT_ARCHITECTURE_v0.2.md` where they conflict.

---

## 0. Product definition

> **ゲームで自分が出会ったものを記録すると、ネタバレにならない範囲で固定データが自動でつながり、手書きメモと攻略サイトの代わりになるノート**

The product exists because of three frictions:

1. 攻略サイトはネタバレを避けたいので見たくない。
2. 手書きメモは更新・整理が大変。
3. 季節・材料・加工方法・誕生日などの固定情報を毎回調べて書き写すのが大変。

The product flow is:

```
出会う
  ↓
つながる
  ↓
使う
```

### 出会う
ゲーム内で知ったものを、最小限の入力で登録する。

Examples:
- 作物
- 料理
- 加工
- 住人
- お願い

### つながる
登録したものに、アプリが持つ固定データを自動で結びつける。

Examples:
- 季節
- 材料
- 加工方法
- 誕生日
- お願いの必要品
- 作り方

### 使う
つながった情報を、プレイ中の判断に使う。

Examples:
- 計画
- 必要なもの
- やること
- 今日のホーム
- 次のバザール
- 不足確認

---

## 1. Product guardrail

Every new feature must answer all three.

1. プレイヤーは何を、どれだけ少ない入力で登録するか。
2. 登録すると、どの固定データが自動でつながるか。
3. ネタバレの線はどこか。

If all three cannot be answered, the feature may be outside this product's role.

This is the primary anti-bloat rule.

---

## 2. Spoiler boundary

### Core rule

> **ゲームがその時点でプレイヤーに見せた情報まで。**

The app may hold complete master data internally, but it must not expose information beyond the player's encountered/revealed state.

This rule is global.

It applies to:
- 作物
- 料理
- 加工
- 住人
- お願い
- future knowledge types

### Safe examples

If the player has discovered a recipe and the game itself shows its ingredients:
- ingredients may be shown automatically.

If the player has met a resident:
- non-spoiler official profile data may be attached automatically.

If the player receives a request and the request screen shows reward:
- reward may be shown automatically.

### Unsafe examples

Do not show:
- future request stages,
- future residents in autocomplete,
- hidden unlock conditions,
- future recipes/items merely because master data contains them.

---

## 3. Product architecture

```
MASTER DATA
(app-owned fixed data; not directly visible)
      │
      │ spoiler boundary
      ▼
NOTE / 積み上げ
      ├─ 出会ったもの
      │   ├─ 作物・品目
      │   ├─ 作り方（料理・加工）
      │   ├─ 住人
      │   └─ お願い
      │
      ├─ 手持ち
      │   ├─ 数
      │   ├─ 品質
      │   ├─ 保管場所
      │   └─ 育成・加工中
      │
      └─ 進み具合
          ├─ 今日の日付
          ├─ お願いの進行
          └─ その他プレイ進行

      ▼
USE / 使う
      ├─ 計画
      │   ├─ 目標
      │   ├─ 必要なもの
      │   └─ やること
      │
      └─ 今日 / Home
          └─ 時間 × 計画 × 手持ちから導出

MEMO
まだ形のない書きつけ。
分類前の受け皿。

TIME
季節・曜日・イベント・誕生日・バザールなど、
全体を横切る軸。
```

### Important interpretation

Planning is **one use of the Notebook**, not the definition of the whole product.

The app must never drift into generic project-management software.

---

## 4. Domain model

### 4.1 Item / Crop

Owned by:
- master data,
- reveal/known state,
- player state.

Can contain:
- fixed season/grow information,
- quality,
- count,
- storage,
- growing/processing state.

Must not contain:
- goal-specific required quantity.

---

### 4.2 Production Method / 作り方

Cooking and processing share the same conceptual shape:

```
inputs → method/facility → output
```

User-facing distinctions such as 料理 / 風車加工 may remain.

Internally this shared model supports multi-step connection and reverse planning.

State:
- master definition,
- known/revealed,
- optional favorite/archive metadata.

---

### 4.3 Resident

Owned by:
- master,
- known/revealed state,
- player annotations.

When a resident has been encountered:
- non-spoiler official profile information may be shown automatically,
- birthday may be connected,
- the user may keep a personal memo about the resident.

Resident memo is an entity annotation, not a separate generic note system.

---

### 4.4 Request / お願い

Use the **game's actual Japanese label** consistently.

Master owns:
- request text,
- required items,
- reward,
- hidden unlock/sequence metadata.

Player owns separate progress:
- encountered/accepted,
- completed,
- reveal state.

The Goal used to execute the request is separate.

---

### 4.5 Bazaar occurrence

A Bazaar is a dated calendar occurrence.

A Goal may reference a specific occurrence.

Do not use:
- moving `systemKey: next_bazaar` semantics as Goal identity.

After a Bazaar passes:
- preserve history,
- optionally offer to carry remaining targets to the next occurrence.

---

### 4.6 Goal / 目標

A desired outcome.

Fields:
- title,
- status,
- blocked reason,
- related source(s).

Statuses:
- 進行中
- いつか
- 止まっている + 理由
- 完了

Do not add:
- generic season field,
- generic deadline field,
- priority,
- tags,
- child tasks.

Timing comes from related game-world events when applicable.

---

### 4.7 Task / やること

One concept everywhere.

Fields:
- text,
- done,
- pinned / ★今やる,
- optional goalId.

Standalone and Goal-linked tasks are the same object.

No:
- ToDo concept,
- promotion,
- child tasks,
- Task-owned Requirements.

---

### 4.8 Requirement / 必要なもの

Owned by a Goal.

Fields:
- referenced item or free label,
- required quantity,
- quality condition,
- current amount strategy.

Current amount rule:
- if the same item is already tracked authoritatively in player state, derive it;
- otherwise allow manual current amount.

Never maintain two independent counters for the same authoritative quantity.

---

### 4.9 Memo

Unstructured capture.

Fields:
- text,
- active / processed / archived.

Do not require:
- type,
- deadline,
- classification at creation.

Memo may later become connected to:
- a Task,
- a Goal,
- an entity annotation.

---

## 5. Planning vocabulary

Return to the old coherent vocabulary.

| Use | Label |
|---|---|
| Tab / workspace | **計画** |
| Outcome | **目標** |
| Action | **やること** |
| Resource/condition | **必要なもの** |
| Source linkage | **関連** |
| Free capture | **メモ** |

Remove:
- ToDo
- 作戦 as tab label
- 昇格 / 格上げ
- サブタスク as core abstraction

---

## 6. Planning workspace

```
計画

目標                                      ＋
────────────────────────────────
🎯 ピザを8個作る                         ›
   必要なもの 1/2

🎯 次のバザールに向けて準備              ›
   関連：秋7日のバザール


やること                                  ＋
────────────────────────────────
□ 小麦を収穫する
   ピザを8個作る

□ フェリペの店を見る

□ チーズを加工する
   ピザを8個作る
```

Key rule:
- all active Tasks remain visible in one global list,
- Goal detail is a filtered view of the same Tasks.

---

## 7. Goal detail

The old notebook-like structure is canonical.

```
🎯 ピザを8個作る

関連
料理：ピザ

必要なもの                              ＋
────────────────────────────────
小麦粉 ★2以上
現在 2                         必要 4

チーズ
現在 1                         必要 2


やること                                ＋
────────────────────────────────
□ 小麦を収穫する
□ チーズを作る
□ ピザを焼く
```

Why this works:
- it resembles a handwritten farm notebook page,
- result / resources / actions are visible together,
- the game usually requires preparing something,
- the structure supports both manually created and source-linked Goals.

### Exceptions

Not every Goal needs both sections.

A Goal may legitimately have:
- only Tasks,
- only Requirements,
- neither yet.

The skeleton remains stable.

---

## 8. Task interaction

There is no promotion.

A Task may:
- exist without a Goal,
- be linked to an existing Goal,
- be unlinked later.

Task editor:

```
やること

内容
[ チーズを作る ]

関連する目標
[ ピザを8個作る ▼ ]

★ 今やる
```

Optional convenience:

- **目標に入れる**
- **このための目標を作る**

Creating a Goal from a Task:
- keeps the Task,
- asks for/edit-selects a Goal title,
- links the Task after Goal creation.

The Task never becomes another object.

---

## 9. Registration / “出会う” UX

This is a first-class flow.

### Requirements

- low input burden,
- strong typo tolerance,
- no spoiler leakage,
- immediate payoff after successful registration.

### Current exact-name approach

Keep exact encounter confirmation as the safety principle.

Improve failure handling.

Potential safe assistance:
- normalize hiragana / katakana,
- normalize full/half width,
- absorb punctuation and spacing,
- accept common spelling variants,
- after user input, perform fuzzy matching,
- only show suggestions that are strongly implied by what the user typed.

Do **not** show a browseable list of unknown master data.

Prediction/autocomplete must not become a spoiler surface.

---

## 10. “つながる” moment

Successful registration should visibly reward the user.

Example:

```
「ピザ」を登録しました

つながった情報
・材料：小麦粉 / トマト / チーズ
・カテゴリ：主食
・作り方を確認できます
```

This moment is core to the product.

The app should feel like:
- less writing,
- less lookup,
- more useful context appearing automatically.

---

## 11. Reverse planning

Reverse planning remains valuable, but it is subordinate to the Notebook product definition.

It is one form of “使う”.

Inputs:
- encountered/known production data,
- player state,
- Goal,
- Requirements,
- time.

Outputs:
- shortages,
- candidate production steps,
- suggested Tasks.

Suggestions are user-controlled.

Do not silently create large task trees.

---

## 12. Resident / Request UX

### Resident visibility

Only encountered residents appear in predictive selection.

Once a resident is encountered:
- official non-spoiler profile information may appear,
- birthday may appear,
- user may write a resident memo.

### Request visibility

When a request is encountered:
- show the content the game itself shows at that moment,
- show required items,
- show reward because the game displays it,
- do not show future stages,
- do not show hidden trigger conditions.

Do not display stage numbering.

Use a stable entry such as:
- 新しいお願いを受けた

Request progress:
- encountered,
- completed.

Goal creation is optional.

---

## 13. Time

Time is a cross-cutting axis.

Use:
- year,
- season,
- day,
- weekday,
- specific Bazaar occurrence,
- festivals,
- birthdays,
- known seasonal availability.

Home should derive useful information from time, not merely show a calendar.

Examples:
- today is a resident birthday,
- Bazaar in 3 days,
- relevant crop season,
- linked Goal approaching its referenced event.

---

## 14. Home

Home asks:

> **今日、何を見ればいい？**

It does not own independent domain state.

Candidate sections:

```
⭐ 今やる
□ チーズを加工する

今日
🎂 ユリスの誕生日

不足
小麦粉      2 / 4
  ピザを8個作る

近い予定
🎪 秋7日 バザール   あと3日

未整理メモ
2件
```

Do not duplicate the entire Planning workspace.

---

## 15. Navigation

For now, keep the existing five-workspace structure:

- ホーム
- 種管理
- 料理
- 計画
- メモ

Only rename the experimental ToDo tab back to 計画.

Do not introduce a combined 図鑑 / ノート / 記録 tab yet.

### Clarification on the previous “まとめる” question

The previous proposal meant:

> if future knowledge-oriented destinations such as 料理・住人・加工 keep increasing, should they eventually share one browse workspace?

This is **not a current requirement**.

It should be reconsidered only when Resident/Request implementation makes the current navigation visibly crowded.

No architecture-driven tab reorganization should happen before actual use demands it.

---

## 16. Archive

Completed Goals and Tasks do not need a dedicated history experience.

But they should not be immediately destroyed.

Recommended:
- completion hides them from active views,
- retain them in an Archive / completed filter,
- no timeline or retrospective analytics.

This supports recovery without turning the product into a productivity tracker.

---

## 17. Anti-project-management guardrails

Do not casually add:
- priority,
- due dates,
- tags,
- nested subtasks,
- task dependencies,
- estimates,
- kanban stages.

Before adding a management feature, ask:
- does it reduce handwritten upkeep?
- does it connect game data?
- is it needed during actual play?

The Planning screen should continue to feel like a farm notebook page, not work software.

---

## 18. Current decisions

### KEEP
- exact-encounter registration principle,
- known-only display,
- Goal / Requirement / Task separation,
- notebook-like Goal detail,
- Memo as unstructured capture,
- Home as derived “today” view,
- master data protected from player edits,
- source links rather than Goal types.

### REMOVE
- ToDo term,
- automatic promotion,
- explicit promotion model,
- Task children,
- moving next-Bazaar Goal identity,
- type-specific Goal taxonomy.

### MODIFY
- whole-product definition around Notebook,
- global spoiler/reveal system,
- registration UX,
- current quantity derivation,
- cooking + processing model,
- request model,
- time-driven Home,
- planning list restoration.

---

## 19. Implementation order

Do not begin from schema migration alone.

### Phase 1 — restore the coherent Planning UI
- 計画 / 目標 / やること vocabulary,
- flat global Task list,
- Goal detail with 必要なもの / やること,
- Goal statuses,
- remove ToDo promotion UI.

### Phase 2 — preserve and reconnect data
- migrate v0.8 experimental Task children safely,
- retain Requirements,
- keep recipe reverse planning,
- remove runtime dependence on Goal kind.

### Phase 3 — improve “出会う → つながる”
- registration assistance,
- visible “つながった情報” feedback,
- global reveal policy helpers.

### Phase 4 — Resident + Request
- encountered resident state,
- safe official profile data,
- resident memo,
- request progress,
- optional Goal link.

### Phase 5 — time / Home
- specific Bazaar occurrences,
- birthday relevance,
- richer today derivation.

---

## 20. Current design baseline

The architectural north star is no longer:

> plan better.

It is:

> **encounter something once, write less, and let the notebook become more useful without spoiling the game.**
