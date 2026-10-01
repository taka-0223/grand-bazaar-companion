# Grand Bazaar Companion — Product Architecture v0.4

Status: **CURRENT DESIGN BASELINE / IMPLEMENTATION READY**
Date: 2026-10-01

This document supersedes `PRODUCT_ARCHITECTURE_v0.3.md` where they conflict.

---

## 0. Product definition

> **ゲームで自分が出会ったものを記録すると、ネタバレにならない範囲で固定データが自動でつながり、手書きメモと攻略サイトの代わりになるノート**

Core loop:

```
出会う
  ↓
つながる
  ↓
使う
```

The product is not a generic planner, checklist app, database browser, or攻略サイト.

It exists to:
- reduce rewriting and repeated lookup,
- preserve only what the player has encountered,
- connect fixed game data automatically,
- make that accumulated knowledge useful during play.

---

## 1. Global product rules

Every feature must answer:

1. プレイヤーは何を、どれだけ少ない入力で登録するか。
2. 登録すると、どの固定データが自動でつながるか。
3. ネタバレの線はどこか。

Additional v0.4 rule:

4. **その情報は「記録」なのか「プレイヤー状態」なのか「使うための計画」なのかを混ぜない。**

This prevents:
- Request becoming a Goal,
- Bazaar becoming a special Goal type,
- ingredient groups becoming fake inventory entities,
- Home owning duplicate state.

---

## 2. Spoiler boundary

Core rule:

> **ゲームがその時点でプレイヤーに見せた情報まで。**

Master Data may know more than the UI exposes.

### Allowed after encounter / explicit registration
- crop season and grow information,
- recipe ingredients shown by the game,
- resident profile information the game exposes,
- request content/objectives/reward shown on the request screen,
- fixed data for an upgrade tier the user has already encountered.

### Hidden by default
- future request titles,
- future request trigger conditions,
- future upgrade tiers,
- unseen residents,
- unknown recipes/items,
- future unlock sequence.

### Search/autocomplete exception
Autocomplete may reveal only candidates **strongly implied by the user's typed text**.

No browseable unknown master list.

---

## 3. v0.4 product architecture

```
MASTER DATA
  ├─ Item / Crop / Flower
  ├─ Production Method
  ├─ Resident
  ├─ Request
  ├─ Upgrade
  └─ Calendar facts
          │
          │ spoiler / reveal boundary
          ▼
NOTE / 記録
  ├─ Known Item / Crop / Flower
  ├─ Known Recipe / Process
  ├─ Known Resident
  ├─ Known Request + Request Progress
  ├─ Player State
  │   ├─ inventory-like tracked counts
  │   ├─ quality
  │   ├─ storage
  │   └─ growing / processing
  └─ Memo

TIME
  ├─ today
  ├─ season / weekday
  ├─ weather (optional manual)
  ├─ festivals / birthdays
  └─ specific Bazaar occurrences

USE / 使う
  ├─ Planning
  │   ├─ Goal
  │   ├─ Requirement
  │   ├─ Task
  │   └─ Goal Memo
  ├─ Bazaar Prep
  └─ Home
```

Important:
- Request is a NOTE-domain record, not a Goal subtype.
- Bazaar Prep is a recurring USE workspace, not a Goal subtype.
- Goal may reference a Request or specific Bazaar occurrence, but does not become those things.

---

## 4. Item / Crop / Flower model

### Master-owned fixed data

Examples:
- seasons,
- grow days,
- regrow days,
- whether repeated harvest is possible,
- fixed item category,
- source / facility relationships.

These are not player-editable facts.

### Player-owned state

Examples:
- seed/seedling quality,
- count,
- growing status,
- growing count,
- storage / processing location,
- personal memo.

### Detail presentation

For growable entities, show fixed cultivation facts near the top:

```
育成情報
春・冬

収穫まで
1日1回水やり：6日
1日2回水やり：5日

連作
あり
再収穫：4日
```

If `regrow_days == null`:

```
連作
なし
```

Flowers use the same seasonal matching system as crops.

Do not maintain a separate "flower season" mechanism.

### Data quality rule

If master data has no verified Japanese name or verified season:
- do not silently expose uncertain data as fact,
- keep the entry registrable only if the player explicitly entered it,
- mark uncertain master fields internally.

---

## 5. Ingredient Group semantics

Examples:
- ハーブ類
- ミルク類
- 卵類
- チーズ類
- きのこ類

These are **recipe conditions**, not standalone encountered inventory entities.

Rule:

> A group ID may exist in recipe/requirement logic, but it must not be automatically inserted into `knownEntities` or treated as a concrete item.

Concrete known members may be shown as helpful candidates only when already known.

Example:

```
必要なもの
ハーブ類 ×2

手元の候補
ミント
ラベンダー
```

The app must never require the user to register one specific herb merely to acknowledge the group condition.

---

## 6. Production Method / Recipe

Cooking and processing remain conceptually:

```
inputs → method/facility → output
```

### Recipe identity display

Do not invent decorative category emojis when they are not reliable game semantics.

Current canonical display:
- recipe name,
- recipe category text,
- known ingredients,
- known method/process relationships.

Potential future display:
- game-faithful cooking equipment / utensil, only after verified master data exists.

Do not substitute guessed emoji for missing equipment data.

---

## 7. Resident

Resident is an encountered entity.

Fields:

### Master
- canonical name,
- birthday,
- favorite color,
- other safe profile facts where appropriate.

### Player annotation
- memo,
- optional notes about likes/dislikes when player chooses to record them.

### Favorite color interaction

Favorite color should not be free text once canonical master data is established.

UI:

```
好きな色
[赤] [青] [緑] [黄] [...]
```

Use canonical game color IDs / labels from master data.

When the resident is known and the color is safely revealable:
- preselect / display the master value.

Do not create a second user-authored truth that can conflict with master data.

---

## 8. Request / お願い — redesigned

Request is an independent notebook record.

It is not:
- a Goal subtype,
- a Requirement bundle,
- a resident stage number.

### 8.1 Request Master

Fields may include:

- `id`
- `title`
- `requesterResidentId`
- `description`
- `objectives[]`
- `reward[]`
- `triggerConditions[]` — hidden/internal by default
- canonical source metadata

### 8.2 Request Progress

Player-owned:

- `requestId`
- `status`: active / completed
- `objectiveProgress{}`
- `encounteredAt` optional
- `completedAt` optional
- `memo` optional

### 8.3 Objective model

A Request can require items or repeated actions.

Canonical objective shape:

```
RequestObjective
├─ type
├─ label
├─ target
├─ current strategy
└─ optional referenced entity
```

Initial objective types:

- `item_quantity`
- `action_count`
- `money_amount`

Examples:

```
チーズを5個渡す
type: item_quantity
target: 5
itemId: cheese
```

```
お風呂に5回入る
type: action_count
target: 5
actionKey: bath
```

```
バザールで30,000G売る
type: money_amount
target: 30000
metricKey: bazaar_sales
```

Do not overload Goal Requirement to represent these.

### 8.4 Registration entry

Primary entry should support **request title first**.

Reason:
- existing players may already have completed many requests,
- rebuilding history resident-by-resident would create setup work.

Canonical flow:

```
＋お願いを登録

お願い名
[ 疲れた時にはおふ... ]

候補
疲れた時にはお風呂
```

After selection:

```
疲れた時にはお風呂
依頼人：ウィルバー

達成条件
お風呂に入る  5回

状態
○ 進行中
○ 完了済み
```

Resident-first registration may remain as a secondary entry.

### 8.5 Search spoiler rule

- no request-title browse list,
- no full resident request list,
- exact/fuzzy suggestions only after meaningful user input,
- do not show future trigger conditions in registration.

### 8.6 Trigger conditions

Friendship level is not assumed to be the only trigger type.

Master may hold:
- friendship threshold,
- date/event,
- Bazaar rank,
- relationship event,
- other prerequisites.

But these conditions stay hidden unless:
- the game has exposed them, or
- the user explicitly asks for攻略-level information outside the app's spoiler-safe default.

No "Request Stage 1 / 2 / 3" abstraction.

### 8.7 Goal relation

A Request may optionally link to a Goal.

Example:

```
お願い：疲れた時にはお風呂
関連する目標：なし
```

Most requests do not need a Goal merely because they exist.

---

## 9. Bazaar Prep — recurring workspace

v0.4 changes the default Bazaar model.

A Bazaar occurrence remains a dated TIME event.

But ordinary Bazaar preparation is **not automatically a Goal**.

### Why

Bazaar prep is recurring operational work:
- every week,
- often similar checklist,
- not necessarily a desired outcome that should be archived as a Goal each time.

### Canonical Home block

```
🎪 次のバザール
秋14日・あと4日

□ 出す商品を決める
□ 加工品を回収
□ 倉庫から売り物を出す
```

This is Bazaar Prep.

### Persistence

Bazaar Prep may contain reusable / carry-forward checklist items.

After the occurrence:
- completed temporary items may clear,
- unfinished items may optionally carry forward,
- recurring template items remain.

Do not silently convert Bazaar Prep into Goal history.

### When a Goal is appropriate

User intent such as:

- 今回10万G売る
- ピザを20個用意する
- バザールランクを上げる

is a real Goal.

That Goal may reference a specific Bazaar occurrence.

---

## 10. Goal / Planning

Goal remains a desired outcome.

Fields:

- `id`
- `title`
- `status`
- `blocker`
- `relatedSource[]`
- `memo`

Statuses:
- active
- someday
- blocked
- done

### Goal detail

```
🎯 ピザを8個作る                     完了

関連
料理：ピザ

必要なもの
小麦粉      2 / 4
チーズ      1 / 2

やること
□ 小麦を収穫する
✓ チーズを作る
  ─────────────
□ ピザを焼く

メモ
高品質の分はバザール用に残す
```

### Completed Tasks inside Goal

Important v0.4 rule:

> Completed Tasks stay visible inside Goal detail.

Display:
- checked,
- struck through,
- visually quieter.

Global Planning task list still shows active Tasks by default.

This gives:
- Goal-local progress/history,
- uncluttered global active list.

### Quick complete

Goal detail gets a direct completion action.

Recommended label:
- `✓ 完了`

Completion:
- sets Goal to done,
- does not delete Tasks/Requirements/Memo,
- supports Undo.

### Archive / completed Goals

Planning needs a lightweight completed view.

Recommended:
- active view by default,
- `完了した計画` entry/filter,
- completed Goals are read/edit/reopen capable.

No analytics or timeline.

### Goal Memo

A Goal owns one lightweight free-text memo.

It is not:
- a Task,
- a Requirement,
- a generic Memo record.

It is annotation on the Goal.

---

## 11. Goal-detail FAB

Global FAB behavior remains context-aware.

### On Goal detail

FAB opens:

```
この計画に追加

やること
必要なもの
メモを書く / 編集
```

It should not open the generic Memo-first quick-add sheet.

Reason:
- context is already known,
- goalId should be implicit,
- user should not have to relink the created item.

Do not create multiple floating buttons.

One FAB, contextual sheet.

---

## 12. Task / やること

Fields remain:

- text,
- done,
- pinned / ★今やる,
- optional goalId.

Interaction:

- row tap → edit,
- checkbox → complete,
- star → Home "今やる".

Do not add an "編集" button when row tap already edits.

Completed standalone Tasks:
- hidden from active global list,
- retained for recovery/history only if needed.

Completed Goal-linked Tasks:
- hidden from active global list,
- visible in Goal detail.

---

## 13. Save behavior

v0.4 adopts an autosave-first interaction model.

### Existing records

No explicit Save button is required for ordinary edits.

Rules:

- toggle / select / checkbox / numeric stepper:
  - save immediately.
- text input / textarea:
  - debounce save (target 300–500ms),
  - save again on blur as safety.
- top save-status indicator:
  - 保存中…
  - 保存済み

### New records

Creation still requires an explicit commit action:

- 追加
- 登録
- 作成

Reason:
- prevents accidental empty/partial entity creation.

### Destructive actions

Delete / archive / complete:
- immediate action is acceptable,
- support Undo where practical,
- destructive delete may still ask confirmation.

### Navigation safety

Leaving an editor must not lose text.

---

## 14. Memo interaction

Generic Memo remains unstructured.

### Card interaction

- card tap → edit,
- remove separate "編集" button,
- swipe left → archive,
- archive action supports Undo.

### Manual ordering

User may reorder active Memo cards.

Recommended mobile interaction:
- visible/subtle drag handle,
- press-and-drag via Pointer Events,
- persist explicit `order` / ordered IDs.

Do not overload whole-card long press because:
- it conflicts with normal scroll/tap,
- swipe is already assigned to archive.

### Swipe safety

Archive only after:
- horizontal threshold,
- vertical-dominance rejection,
- release confirmation.

Do not archive merely because the user's finger drifted while scrolling.

---

## 15. Weather

Weather may be manually recorded on calendar dates.

Low-priority optional feature.

Example:

```
秋12日
天気：雨
```

Rules:
- manual only unless reliable in-game-derived data source exists,
- no forecast/spoiler inference,
- Home may show today's manually recorded weather.

Do not let weather work block higher-value notebook features.

---

## 16. Upgrade / strengthening price lists

Master may hold upgrade tiers and prices.

Default app behavior is reveal-gated.

### Safe display

Show:
- tiers the user has explicitly encountered/registered.

Hide:
- future tiers,
- future unlock requirements,
- future prices.

Potential registration:

```
強化を見た
[ カバンを広げる ]

表示された価格
5,000G
```

Later the master may connect canonical values.

This is useful but **not a current implementation priority**.

---

## 17. Home

Home continues to answer:

> **今日、何を見ればいい？**

Candidate order:

```
⭐ 今やる

今日
- birthday
- festival
- optional weather

🎪 次のバザール
- date / remaining days
- Bazaar Prep

不足
- active Goal shortages

近い予定

未整理メモ
```

Home owns no duplicate domain data.

---

## 18. Navigation

Keep the current five primary tabs for now:

- ホーム
- 種管理
- 料理
- 計画
- メモ

Resident / Request do not automatically earn new bottom-nav tabs.

Their entry/browse UX should be introduced without changing primary navigation until real usage proves otherwise.

---

## 19. Interaction principles

### Tap beats button duplication

If a whole row/card already has one obvious primary action:
- tap the row/card.

Do not add redundant "編集" controls.

### Context beats relinking

If user is inside a Goal:
- additions automatically belong to that Goal.

If user is inside a Resident:
- resident-specific additions automatically relate to that Resident.

### Labels only when they add information

Avoid badge/chip proliferation.

Use:
- hierarchy,
- placement,
- spacing,
- familiar symbols

before adding labels.

---

## 20. Decisions from 2026-10-01 play notes

### ACCEPT / DESIGN NOW

- resident favorite color → canonical selection/master field,
- Request title-first registration,
- Request objective supports action count,
- friendship is not assumed as universal Request sequencing,
- flowers use seasonal matching,
- grow days + repeated harvest shown as fixed crop facts,
- Goal memo,
- Goal-local completed Tasks remain visible,
- completed Goal archive,
- quick Goal completion,
- Goal-detail contextual FAB,
- autosave for edits,
- Memo manual reorder,
- Memo swipe archive,
- Memo edit button removal.

### MODIFY PREVIOUS DESIGN

- ordinary Bazaar prep is no longer modeled as a Goal by default,
- Request is more independent from Goal than v0.3 implied,
- Requirement is not reused for non-resource Request objectives.

### DEFER / LOW PRIORITY

- manual weather,
- upgrade price list / strengthening catalog.

### RESEARCH / MASTER-DATA WORK REQUIRED

- canonical resident favorite color vocabulary and values,
- full Request master / objective / trigger data,
- verified flower Japanese names where currently missing,
- cooking-equipment master if used for recipe display,
- upgrade tiers/prices with reveal boundaries.

---

## 21. Implementation order after v0.4

Do not implement all v0.4 changes at once.

### Slice A — v0.9.5: current notebook polish

Low-risk, existing-domain improvements:

1. crop/flower fixed facts
   - season consistency,
   - grow days,
   - repeated-harvest / regrow info.
2. Goal detail
   - show completed linked Tasks,
   - Goal memo,
   - quick complete,
   - completed Goal view.
3. Memo
   - remove edit button,
   - row tap remains edit.
4. autosave foundation
   - begin with existing record editors,
   - preserve explicit creation actions.

### Slice B — v0.10: Request domain

1. Request Master / Request Progress split.
2. title-first spoiler-safe registration.
3. generic objective model.
4. active / completed import for past play.
5. resident relation.
6. optional Goal relation.

### Slice C — v0.11: recurring / gesture UX

1. Bazaar Prep recurring workspace.
2. contextual Goal FAB.
3. Memo drag reorder.
4. Memo swipe archive.
5. optional manual weather.

### Slice D — later Master expansion

- resident master completion,
- upgrade/reveal system,
- verified cooking equipment,
- richer player-state quantity derivation.

---

## 22. Explicit non-goals

Do not add:

- Goal priority,
- arbitrary due dates,
- nested Task trees,
- kanban,
- generic tags,
- Request stage numbering,
- future Request browser,
- future upgrade browser,
- fake inventory records for ingredient groups,
- analytics/productivity metrics.

---

## 23. v0.4 design baseline

The app should increasingly feel like:

> **一度ゲームで見たものをノートに置けば、必要な固定情報だけが自然につながり、次にゲームを触る時の自分を助けてくれる。**

The next implementation should optimize for:
- less manual rewriting,
- lower interaction cost,
- stable domain boundaries,
- spoiler-safe connected knowledge,
- notebook-like feel over project-management features.
