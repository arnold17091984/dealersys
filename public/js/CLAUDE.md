# JavaScript Modules

`app.js` がメインコントローラ。`modules/` 内の各モジュールを初期化・統合する。

## カードスキャン順序

```
deck[0] = P-Right  (1st scan) → Server intPosi=2
deck[1] = B-Right  (2nd scan) → Server intPosi=5
deck[2] = P-Left   (3rd scan) → Server intPosi=1
deck[3] = B-Left   (4th scan) → Server intPosi=4
deck[4] = 5th card (5th scan) → Server intPosi=3 or 6 (動的)
deck[5] = 6th card (6th scan) → Server intPosi=6
```
