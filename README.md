# app-air-mro

**air-mro —— 航空機の整備・修理・オーバーホール（MRO）を扱う appview の公開面。**
work order の起票、部品トレース、耐空性（airworthiness）確認といった業務そのものは
ここには**無い**。この repository が持つのは Cloudflare Worker 1 本 ——
XRPC を MCP router へ中継する BFF と、その説明ページである。

`etzhayyim/root` の `60-apps/etzhayyim-project-air-mro` からの抽出物で、
**2026-08-18 に appview を TypeScript/Svelte から ClojureScript へ移行した**
（`docs/adr/0001`）。数字はすべて `scripts/verify-docs-claims.cljs` が tree から
再計算して検査する。

## deploy されるものは、いま読んでいるソースである

```
src/air_mro/route.cljc    判断（どの handler が答えるか）  ← 純 .cljc、テスト対象
src/air_mro/view.cljc     ページ（jp-go-dds の hiccup）    ← 純 .cljc、テスト対象
src/air_mro/worker.cljs   Request/Response に触る唯一の層
        ↓ shadow-cljs :target :esm
dist/worker.js            ← wrangler.jsonc の "main" が指すもの
```

移行前は `main` が `svelte/.svelte-kit/cloudflare/_worker.js` を指していた ——
**tree に存在しない** SvelteKit のビルド出力である（`ls svelte/.svelte-kit` →
No such file or directory）。一方、読み手が開く `src/app.ts` は**どの bundle にも
入っていなかった**。いまは `main` が指す bundle が上のソースからコンパイルされた
ものなので、その形は構造的に起こり得ない。`scripts/verify-docs-claims.cljs` が
**shadow の出力先と wrangler の `main` と export の ns 名の 3 つが噛み合っている
こと**を検査し、噛み合わなくなれば落ちる。

判断を `.cljc` に置いてあるのは、ブラウザもビルドも無しにテストするためであり、
ingress capability が qualify した時に **最初に `.kotoba` へ移る部分**だからで
ある（入口を当面 cljs に置くのは ADR-2606290000 の判断）。

## 公開ルート

| METHOD | PATH | 何をするか |
|---|---|---|
| GET | `/` | この appview の説明ページ |
| GET | `/health` | 生存確認。deploy された面が答えることを外から確かめられる |
| POST | `/xrpc/:nsid` | XRPC を MCP router へ中継する |
| OPTIONS | `/xrpc/*` | CORS preflight |

**この表の出所は `air-mro.route/routes` で、ページもそこから描く。** 移行前の
ページ（`svelte/src/routes/+page.svelte`）は `"routeCount": 0` / `"routes": []` /
`"vars": []` を literal で持っており、隣の `wrangler.jsonc` が route 2 パターンと
var 8 個を宣言していることに気づけなかった。いまは route 表を渡す側が持ち、
ページは描くだけなので、両者がずれる余地が無い。テストは route 表を差し替えると
ページも変わることを固定している。

`/health` は移行前 **deploy されていなかった**。`src/app.ts` は持っていたが、
そのファイルはどの bundle にも入っていない。deploy されていた SvelteKit 側の
route ファイルは 2 つだけで（`find svelte/src/routes -type f` →
`/+page.svelte` と `/xrpc/[...path]/+server.ts`）、`/health` はそこに無い。
移行で実際に答えるようにし、route 表に載せた。

（移行前の SvelteKit をビルドして「ビルド出力に health が 1 件も無い」ことを
確認したのは**兄弟 repo `app-air-ffp` に対する先行調査**であって、この repo で
私が実行したものではない。ここで私が測ったのは route ファイルの一覧である。）

## この Worker は operation を 1 つも名指ししない

path に来た NSID をそのまま MCP router へ `tools/call` として転送する。実測:
移行前の `svelte/src/routes/xrpc/[...path]/+server.ts` に `airMro` という文字列は
**1 度も現れなかった**（`grep -c` → 0）。移行後も同じである。

したがって **この repository は「このアプリに何ができるか」を学ぶ場所ではない。**
`APP_CAPABILITIES` が宣言する 3 つ（`createWorkOrder` / `trackComponent` /
`checkAirworthiness`）は、抽出元が持っていた 8 operation の**先頭 3 つ**であって
curate された公開サブセットではない —— 同じ形が 9 つの `app-air-*` 兄弟すべてに
現れる。強制ではなく文書である。

## 多段パスは移行前と同じく中継する

移行前の SvelteKit route は rest parameter `[...path]` で受けており、**空文字だけを
400** にして `a/b` はそのまま tool 名として転送していた。ここもそう振る舞う。
1 セグメントに絞ると挙動が変わる —— NSID に `/` は現れないので上流で失敗する
だけだが、**それは移行ではなく方針変更**であり、移行の commit に紛れ込ませる
ものではない。絞りたいなら別の決定として記録する。

## いま在るもの

| 面 | ファイル |
|---|---|
| 判断・描画・edge | `src/air_mro/{route.cljc, view.cljc, worker.cljs}` |
| テスト | `test/air_mro/route_test.cljc`（6 tests / 25 assertions） |
| ビルド | `deps.edn` / `shadow-cljs.edn` |
| Worker 設定 | `wrangler.jsonc` |
| actor 記述子 | `kotodama.jsonld` |
| 検証 | `scripts/{smoke-worker.cljs, verify-docs-claims.cljs}` |
| 由来・権利・識別 | `NOTICE` / `README.edn` / `migration.edn` / `MIGRATION-TODO.md` |
| 文書 | `README.md` / `docs/operator-quickstart.md` / `docs/adr/0001-*.edn` |
| **触っていない domain library** | `kotoba/`（TypeScript 5 本、下記） |

**appview の TypeScript は 0 本、正本言語（`.cljs`/`.cljc`）が 4 本。**
移行前は appview の `.ts` が 3 本 + `.svelte` が 1 本、正本言語は 0 本だった。
撤去したパスに戻る場合（`removed-by-migration-absent`）も、別名で入る場合
（`appview-ts-files`）も、別々の claim が捕まえる。

## What this migration did not touch — `kotoba/` は appview ではない

`kotoba/` は TypeScript の**ドメインライブラリ**（`src/registry.ts` 434 行 +
`src/types.ts` 406 行 + `src/index.ts`、`test/air-mro.test.ts` に 12 tests）で、
**そのまま残した**。測定に基づく判断である:

| 問い | 測定 |
|---|---|
| どれかの bundle に入っているか | **いいえ**。移行前の `main` は svelte のビルド出力を指していた |
| 置き換える対象から参照されているか | **いいえ**。`src/app.ts` も `svelte/` も import していない |
| 逆に appview を参照しているか | **いいえ**。import は `@etzhayyim/sdk` / `sdk-mock` / 自分の相対パスだけ |
| 依存は実在するか | **はい**。pin された 2 つの SHA を `git fetch <url> <sha>` で取得、どちらも `type=commit` |

「TypeScript を全部消す」というテンプレート的な読み方でこれを消すのは、移行では
なく**破壊**である。`scripts/verify-docs-claims.cljs` はこの 5 本の `.ts` の
**本数**と**各パスの存在**を pin しているので、黙って増えることも消えることも
できない。移すなら別の決定で、依存先の cljs face が要る。

⚠ **`npm install` は通らない** —— npm 11.16 が git 依存の nested install を
`EALLOWSCRIPTS` で拒否する。これは「依存が無い」のではなく「手元の npm が
入れられない」であって、**両者を混ぜない**。この移行で kotoba のテストは
走らせていない。

## ページが出す値・出さない値

env の**キー名**は出すが、値は出さない —— **中継先を除いて**。
`AGENTGATEWAY_MCP_ROUTER_URL` の値だけは、どこへ中継するかを運用者が見る
必要があるので意図的に表示する。

smoke はこれを**2 つの独立した印**で見る: 別の var に置いた sentinel
（`SENTINEL-4d71b8`）が出ていないこと、そして中継先の値が出ていること。
片方だけだと「全部隠す」実装も「全部出す」実装も通ってしまう。

## UI

基盤は `kotoba-lang/jp-go-digital-design-system`（デジタル庁デザインシステム）。
色・寸法は `--hig-*` トークン契約だけで書き、raw hex も px フォントサイズも
置かない。app 固有 CSS は 3 行。CSS は外部リクエストゼロの方針どおり
`shadow.resource/inline` で bundle に焼く。

決定論的 audit（`kotoba-lang/design-quality`）で **100.00 / 100（gate 95）**、
`--extra-axes` の 12 軸でも 100.00。

### ただしその 100.00 が保証する範囲は狭い

同じページを **design system の CSS 抜きで描画しても 97.22 で gate 95 を PASS
する**（実測）。CLI 自身が出力にそう書いている ——
`axes scored: 10 … NOT scored: input-zoom, contrast` /
`A pass says nothing about an axis that was not applied`。

だから design system が実際に入っていることは smoke の**別の 2 本**で見る。
`dads-table` が在ることを 1 本で見る形は**落ちない検査**だった —— それは view が
出力する markup であって、CSS が 1 バイトも入っていないページにも現れる。
実測（このページ、2026-08-18）:

| 探す文字列 | CSS 込み | CSS 無し |
|---|---|---|
| `dads-table` | 74 | **6**（0 にならない） |
| `class="dads-table"` | 1 | **1**（markup なので不変） |
| `--color-primitive-blue` | 45 | **0** |

したがって 2 本に割った。**component を使ったか**（`class="dads-table"`）と、
**stylesheet が実際に入ったか**（`--color-primitive-blue`）は別の主張である。
2 つが独立であることを**両方向**で確かめた:

| 壊したもの | component | stylesheet |
|---|---|---|
| `(rc/inline "jp_go_dds/dds.css")` → `""`（**再ビルド**して bundle で確認） | 緑 | **赤** |
| `dds/table` → 生の `[:table]`（source 描画で確認） | **赤** | 緑 |

片方だけを見る形では、どちらの欠陥も緑のまま通り抜ける。

## ビルドが検査になっているか

`shadow-cljs.edn` の `:compiler-options` に `:warnings-as-errors true` を置いた。
無いと shadow は未宣言 var を **WARNING** として **exit 0** し、最初のリクエストで
throw する bundle を書く ——「ビルドが通った」は検査ではない。

この repo で両方向を実測した（`docs/operator-quickstart.md` §4）:

| `:warnings-as-errors` の位置 | ソース | exit | `dist/worker.js` |
|---|---|---|---|
| `:compiler-options` | 未宣言 var | **1** | **不変**（出荷しない） |
| `:build-options` | 同じ未宣言 var | **0** | **新しい bundle**（import で throw） |

**キーを置き間違えた `:warnings-as-errors` は、落ちようのない検査**である ——
この option が防ぐはずの失敗そのものになる。だから検証器はこの配置を
**EDN として parse して**検査する（grep ではこの段落自身に当たってしまう）。

## 呼び先が 1 つも解決しない（移行では直らない）

| ホスト | 役割 | DNS |
|---|---|---|
| `air-mro.etzhayyim.com` | 公開ホスト（wrangler の route） | **NXDOMAIN** |
| `a1rmr001.etzhayyim.com` | 同（nanoid 側） | **NXDOMAIN** |
| `mcp.etzhayyim.com` | `/xrpc/:nsid` の中継先 | **NXDOMAIN** |
| `dispatcher.etzhayyim.com` | `src/app.ts` が持っていた宛先（持ち越さず） | **NXDOMAIN** |

deploy 先も中継先も、いま存在しない。`/xrpc/` は到達できなければ **502 を返す**
——成功と同じ形で隠さない。

## 持ち越さなかったもの（黙って消していない）

移行前の `src/app.ts` にあってどこにも deploy されていなかった経路のうち、
次は**意図的に移していない**:

- **dispatcher への proxy**。宛先が NXDOMAIN で、必要な binding
  （`DISPATCHER_URL` / `DISPATCHER_INTERNAL_SECRET`）は `wrangler.jsonc` に
  **1 つも宣言されていない**
- **`/_app/meta`**。`/health` と同一の JSON を返す重複

必要になった時点で `route.cljc` に足し、テストと binding を伴って戻す。

## 残っている欠陥（移行では直っていない）

1. **`MIGRATION-TODO.md` のチェックボックス 7 件が未チェック**のまま。憲章適合の
   手動レビューは未実施であるとその文書自身が書いている（そして 7 件は「検出された
   違反」ではなく「ドメイン分類から導かれたレビュー項目」だとも書いている）。
2. **`kotoba/` のテストは走っていない**（上記の npm の事情）。
3. **ホストが 1 つも解決しない**（上表）。

## 検証

```bash
npx --yes kbb --backend sci scripts/verify-docs-claims.cljk .     # <dir> は先頭に置く
```

exit 0 = 全一致 / 1 = 食い違い / **2 = 判定できなかった**（0 と区別する）。
テストとビルドと smoke は `docs/operator-quickstart.md`。
