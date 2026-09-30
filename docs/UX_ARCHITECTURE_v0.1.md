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
