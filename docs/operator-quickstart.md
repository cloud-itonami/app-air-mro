# operator-quickstart — app-air-mro

**この repo で今日実際にできることを、踏める形で上から書く。** 所要 5 分。
Cloudflare のアカウントは要らない（deploy だけが要る。§7）。

出力はすべて 2026-08-18 に実際に walk した結果である。**飛ばした手順は
「合格した手順」ではない** —— 走らせていないものは §8 に書いてある。

---

## 0. 前提と、この workspace の罠

| 要るもの | 確認 | この walk で使った版 |
|---|---|---|
| git | `git --version` | 2.51.0 |
| node | `node --version` | v26.3.0 |
| nbb | `npx --yes nbb --version` | v1.4.208 |
| clojure | `clojure --version` | 1.12.5.1654（ビルド時のみ） |

1. **remote は `origin` ではない。** west が remote を org 名で作るので
   `cloud-itonami` である。`git fetch origin` は「repo が無い」ように見える
   エラーを出すが、無いのは remote 名の方である。
2. **`error: could not read IPC response` は fsmonitor daemon のノイズ**で、
   実行したコマンドは成功している。`-c core.fsmonitor=false` で黙る。
   `scripts/verify-docs-claims.cljs` は内部の `git ls-files` にこれを付けて
   あるので、合格した run の出力が失敗したように見えない。
3. **高負荷ビルドは workspace 全体で同時 1 本**（superproject `CLAUDE.md` の
   resource governor）。§4 参照。
4. **`/tmp` に固定名の作業ファイルを置かない。** この machine では並行する
   複数のセッションが同時に走る。実測 2026-08-18、この移行の最中に
   `/tmp/view.bak` が**兄弟 repo を移行していた別セッションに上書きされ**、
   復元したら別 repo の名前空間が入ってきた。同じ日に別のセッションが
   `/tmp/worker.bak` で同じ事故を起こしている。**固定名の backup から
   復元したら、再ビルドして sha256 が壊す前の値に戻ることを確かめる**
   —— 戻らなければ、その backup は自分のものではなかった。以下の手順は
   すべて `W=$(mktemp -d)` の下で作業する。

## 1. 取得して、書いてあることが本当か検査する

```bash
git clone git@github.com:cloud-itonami/app-air-mro.git
cd app-air-mro && REPO=$PWD
npx --yes kbb --backend sci scripts/verify-docs-claims.cljk .
```

実際の出力（末尾）:

```
SCANNED	25
PASS	tracked-files	expected=25	actual=25
PASS	inherited-bytes	expected=4370	actual=4370
PASS	preserved-files-unchanged	expected=[]	actual=[]
PASS	removed-by-migration-absent	expected=[]	actual=[]
PASS	svelte-artifacts	expected=0	actual=0
PASS	appview-ts-files	expected=0	actual=0
PASS	domain-library-ts-files	expected=5	actual=5
PASS	domain-library-intact	expected=[]	actual=[]
PASS	production-canonical-files	expected=4	actual=4
PASS	wrangler-main	expected="dist/worker.js"	actual="dist/worker.js"
PASS	declared-vars	expected=8	actual=8
PASS	declared-routes	expected=2	actual=2
PASS	no-stale-assets-binding	expected=true	actual=true
PASS	sveltekit-compat-flags	expected=0	actual=0
PASS	app-framework-not-sveltekit	expected=true	actual=true
PASS	shadow-builds-that-main	expected=true	actual=true
PASS	warnings-as-errors-under-compiler-options	expected=true	actual=true
PASS	warnings-as-errors-not-under-build-options	expected=nil	actual=nil
PASS	page-renders-route-table	expected=true	actual=true
PASS	stylesheet-inlined-at-build	expected=true	actual=true
PASS	adr-count	expected=1	actual=1
PASS	adrs-read-as-edn	expected=[]	actual=[]
OK	every claim in README.md and docs/operator-quickstart.md holds
```

**exit 2（UNDETERMINED）は 0 ではない** —— tree を読み切れなかったという別の
答えで、「検査して問題なし」と混ぜない。

### この検証器を 9 通りで落として確かめた

| 壊し方 | 落ちた claim | exit |
|---|---|---|
| appview に `.ts` が**別名**で戻る（`src/sneaky.ts`） | `tracked-files` / `appview-ts-files` | 1 |
| 撤去した `src/app.ts` が戻る | `removed-by-migration-absent` | 1 |
| wrangler の `main` を SvelteKit のビルド出力に戻す | `wrangler-main` / `shadow-builds-that-main` | 1 |
| `:warnings-as-errors` を `:build-options` へ移す | `warnings-as-errors-under-compiler-options` / `…-not-under-build-options` | 1 |
| `kotoba/src/registry.ts` を消す | `tracked-files` / `domain-library-ts-files` / `domain-library-intact` | 1 |
| ADR 全体を壊れた 1 form にする | `adrs-read-as-edn` | 1 |
| ADR の末尾に**閉じていない**garbage を足す | `adrs-read-as-edn`（`does not read as EDN`） | 1 |
| ADR の末尾に**閉じた** 2 つ目の form を足す | `adrs-read-as-edn`（`has 2 top-level forms`） | 1 |
| ADR から `:adr/status` を落とす | `adrs-read-as-edn`（`has no :adr/status`） | 1 |

**4 番目が要点である。** `grep -c warnings-as-errors shadow-cljs.edn` は
置き間違えた状態でも `3` を返す —— grep で見る検査はここで緑のままになる。
だから検証器は EDN として **parse** する。

**7 番目も同じクラスの欠陥で、この検証器自身が最初それを持っていた。**
`cljs.reader/read-string` は**先頭の 1 form だけを読んで残りを捨てる**ので、
`(read-string s)` で書いた検査は「EDN として読める」を主張できない ——
実測 2026-08-18、この ADR の末尾に `{:unbalanced "` を足しても **PASS した**。
いまはファイル全体を `[` `]` で包んで読み、**top-level form がちょうど 1 つ**
であること、entity が 1 つの map で `:adr/id` / `:adr/status` / `:adr/body`
を持つことまで検査する。上の 7〜9 番目はその修正後に落ちることを確かめた
ものである。

## 2. テストを走らせる（ビルド不要・ブラウザ不要）

判断（`route.cljc`）と描画（`view.cljc`）は純 `.cljc` なので、nbb だけで回る。

```bash
K=~/github/com-junkawasaki/orgs/kotoba-lang
CP="src:test:$K/jp-go-digital-design-system/src:$K/html/src:$K/css/src"
W=$(mktemp -d)            # §0.4 — never a bare /tmp name on this machine
cat > "$W/run.cljs" <<'EOF'
(require '[cljs.test :refer [run-tests]] 'air-mro.route-test)
(run-tests 'air-mro.route-test)
EOF
npx --yes kbb --backend sci --classpath "$CP" "$W/run.cljs"
```

実際の出力:

```
Testing air-mro.route-test

Ran 6 tests containing 25 assertions.
0 failures, 0 errors.
```

何を固定しているか: `/xrpc/` は**空の nsid だけ** 400 にする（`/xrpc/a/b` は
移行前の rest parameter と同じく転送する。1 セグメントに絞るのは移行では
なく方針変更）、MCP router の URL 解決（空白だけの設定は未設定として扱う）、
`result` / `structuredContent` の剥がし方、`/_app/meta` を持ち越していない
こと、そして**ページが route 表から描かれること**。

**落ちることを確かめた。** `view.cljc` の `route-rows` が引数を無視して固定の
1 行を返すよう変えると、`page-shows-the-real-routes` と
`page-renders-what-it-is-handed-not-a-baked-table` が **3 assertion 赤**に
なる（`/health がページに出ていない` / `/only-this` が無い /
本物の route 表が焼かれている）。戻すと緑。

## 3. ページを描画して採点する

```bash
K=~/github/com-junkawasaki/orgs/kotoba-lang
CP="src:$K/jp-go-digital-design-system/src:$K/html/src:$K/css/src"
cat > "$W/render.cljs" <<'EOF'
(require '["node:fs" :as fs] '[air-mro.view :as view] '[air-mro.route :as route])
(let [css (.readFileSync fs (str (.-DDS js/process.env) "/resources/jp_go_dds/dds.css") "utf8")]
  (.writeFileSync fs (.-OUT js/process.env)
    (view/render {:css css :routes route/routes
                  :vars [:AGENTGATEWAY_MCP_ROUTER_URL :APP_CAPABILITIES :APP_DESCRIPTION
                         :APP_DISPLAY_NAME :APP_FRAMEWORK :APP_NANOID
                         :APP_PERFORMER_TYPE :APP_UI_TYPE]
                  :mcp-url "https://mcp.etzhayyim.com/xrpc/com.etzhayyim.mcp.message"}))
  (println "ok"))
EOF
DDS="$K/jp-go-digital-design-system" OUT="$W/mro-page.html" \
  npx --yes kbb --backend sci --classpath "$CP" "$W/render.cljs"

cd $K/design-quality && npx --yes kbb --backend sci -m design-quality.cli score "$W/mro-page.html" --min 95
```

実際の出力（末尾）:

```
  100.00  $W/mro-page.html
aggregate: 100.00

axes scored: 10 (viewport, safe-area, dynamic-viewport, tap-targets, focus-visible,
                 reduced-motion, overflow-guard, color-scheme, responsive, semantics)
NOT scored: input-zoom, contrast — pass --extra-axes to include the optional ones
A pass says nothing about an axis that was not applied.

gate: aggregate 100.00 >= min 95.00 -> PASS
```

`--extra-axes` を付けた 12 軸でも **100.00 / PASS**。

### ⚠ この 100.00 が保証する範囲は狭い（実測）

**同じページを design system の CSS 抜きで描画しても 97.22 で gate 95 を
PASS する。** CLI 自身が「適用したのは 10 軸」「適用しなかった軸について
pass は何も言わない」と出力に書いている。**「デザインシステムが入っている」
と言えるのは §5 の smoke の 2 本目だけである。**

落ちることは確かめた: `<meta name="viewport">` を 1 つ落とすと **90.74 →
gate FAIL、exit 1**（`no <meta name=viewport> — the page won't fit device width`）。
CLI は gate FAIL で exit 1 を返すので、スクリプトの gate として使える。

## 4. bundle をビルドする

**高負荷ビルドは同時 1 本に制限されている。** 直接叩かず、必ず guard 経由で:

```bash
cd "$REPO"
node ~/github/com-junkawasaki/scripts/resource-guard.mjs run build -- \
  npx --yes amu compile --target wasm32-browser worker
ls -la dist/worker.js
```

**exit 2 は失敗ではなく順番待ちである**（`resource-guard: build is already
running (pid=…, repo=…)`）。迂回せず、retry する。この walk では他セッションの
兄弟移行（`app-air-ffp`）と `cloud-murakumo` がロックを持っていて、1 本の
ビルドに 8 回まで待った。

実際の出力（末尾）:

```
[:worker] Build completed. (55 files, 12 compiled, 0 warnings, 13.16s)
```

`dist/worker.js` は 246,499 バイト、sha256 `79339f33…`。

### 壊れた var はビルドを **落とす**（両方向を実測）

`shadow-cljs.edn` の `:compiler-options` に `:warnings-as-errors true` がある。
無いと shadow は未宣言 var を **WARNING** として **exit 0** し、最初の
リクエストで throw する bundle を書く ——「ビルドが通った」は検査ではない。

`src/air_mro/worker.cljs` の `route/dispatch` を存在しない
`route/dispatch-nonexistent` に改名して測った:

| `:warnings-as-errors` の位置 | exit | `dist/worker.js` の sha256 | 結果 |
|---|---|---|---|
| `:compiler-options`（正） | **1** | `79339f33…`（**不変**） | 出荷しない |
| `:build-options`（誤） | **0** | `270bb85e…`（**新しい**） | 出荷する |
| 戻して再ビルド | **0** | `79339f33…`（元に戻る） | 再現する |

`:build-options` 版が出した bundle を import すると:

```
IMPORT THREW: Cannot read properties of undefined (reading 'h')
```

**キーを置き間違えた `:warnings-as-errors` は、落ちようのない検査**である
—— この option が防ぐはずの失敗そのものになる。だから §1 の検証器は配置を
**EDN として parse して**検査する。

## 5. ビルドした成果物を実際に叩く

ここが deploy されるものに触る唯一の検査である。

```bash
cd "$REPO" && npx --yes kbb --backend sci scripts/smoke-worker.cljk dist/worker.js
```

実際の出力:

```
PASS	default export has fetch	expected=true	actual=true
PASS	GET / status	expected=200	actual=200
PASS	GET / is html	expected=true	actual=true
PASS	page advertises /health	expected=true	actual=true
PASS	page advertises /xrpc/:nsid	expected=true	actual=true
PASS	page shows a var key	expected=true	actual=true
PASS	page hides other var values	expected=false	actual=false
PASS	page shows the relay target it uses	expected=true	actual=true
PASS	page uses the design system components	expected=true	actual=true
PASS	page carries the stylesheet itself	expected=true	actual=true
PASS	GET /health status	expected=200	actual=200
PASS	health names its routes	expected=true	actual=true
PASS	POST /xrpc/ status	expected=400	actual=400
PASS	single-segment nsid is relayed (502, unreachable .invalid)	expected=502	actual=502
PASS	multi-segment nsid is relayed the same way, not rejected	expected=502	actual=502
PASS	unreachable relay is not hidden as success	expected=true	actual=true
PASS	OPTIONS preflight	expected=204	actual=204
PASS	unknown path	expected=404	actual=404
PASS	wrong method	expected=405	actual=405
PASS	/_app/meta was not carried over	expected=404	actual=404
OK	the built bundle answers as the route table says
```

**bundle が無ければ exit 2**（「判定できなかった」であって合格ではない）:

```
UNDETERMINED	no bundle at …/dist/does-not-exist.js
Refusing to report a pass: build it first (see docs/operator-quickstart.md S4).
```

### この smoke の 2 つの割り方

**(a) design system は 2 本で見る。** 「`dads-table` が在る」を 1 本で見る形は
**落ちない検査**だった —— それは view が出力する markup であって、CSS が
1 バイトも入っていないページにも現れる。実測（このページ）:

| 探す文字列 | CSS 込み | CSS 無し |
|---|---|---|
| `dads-table` | 74 | **6**（0 にならない） |
| `class="dads-table"` | 1 | **1**（markup なので不変） |
| `--color-primitive-blue` | 45 | **0** |

`(rc/inline "jp_go_dds/dds.css")` を `""` に替えて**再ビルドし**、smoke を
掛け直すと:

```
PASS	page uses the design system components	expected=true	actual=true
FAIL	page carries the stylesheet itself	expected=true	actual=false
FAILED	1 check(s): page carries the stylesheet itself
```

後者だけが赤くなり、前者は緑のまま。**別の主張なので別の検査である。**

逆向きも確かめた。`dds/table` の呼び出しを生の `[:table]` に置き換えて描画すると:

```
FAIL	page uses the design system components	expected=true	actual=false
PASS	page carries the stylesheet itself	expected=true	actual=true
```

**今度は前者だけが赤い。** 2 本は独立に discriminate する。1 本だけを見る形
では、どちらの欠陥も緑のまま通り抜ける。（この逆向きの確認は source 描画で
行った。CSS 側は bundle を作り直して確認している。）

**(b) 値の露出は 2 つの独立した印で見る。** 出てはいけない値（別の var に
置いた `SENTINEL-4d71b8`）と、出なければいけない値（中継先 URL）。片方だけ
だと「全部隠す」実装も「全部出す」実装も通る。中継先を `.invalid`
（RFC 2606 で必ず解決しない TLD）にしてあるので、この検査も、そして
XRPC 中継の 502 も、**実 DNS に依存しない**。

独立していることを 3 通りで確かめた:

| | 変えたもの | 「値を隠す」 | 「中継先を出す」 |
|---|---|---|---|
| A | 無改変 | 緑 | 緑 |
| B | worker が env の **VALUE** を渡す | **赤** | 緑 |
| C | view が中継先の表示をやめる | 緑 | **赤** |

**この 3 つは source を描画して確かめたもので、bundle を作り直しての確認では
ない**（build lock を他セッションが長時間保持していたため。迂回はしていない）。
bundle 側で smoke が落ちることは (a) の CSS mutation で確認済み。

4 つ目として B と C を同時に当てたが、**実演として数えない** —— leak した値の
中に中継先 URL 自身が含まれるので「中継先を出す」は正当に緑のままだった。
**狙いを外した mutation の緑は実演ではない。**

## 6. Workers ランタイム（workerd）で動かす

Node で import する smoke より強い検査。実際の workerd で起こす。

```bash
cd "$REPO"
npx --yes wrangler@latest dev --local --port 8801 --ip 127.0.0.1
# 別シェルで
B=http://127.0.0.1:8801
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $B/
curl -s $B/health
```

実際の出力（**`compatibility_flags` を外した設定のまま**、全 route）:

```
GET  /                  200 text/html; charset=utf-8
GET  /health            {"ok":true,"app":"air-mro","runtime":"cljs",
                         "routes":["/","/health","/xrpc/:nsid"]} <- 200
POST /xrpc/             {"error":"Missing XRPC method"} <- 400
POST /xrpc/com.x.y      {"error":"MCP router unreachable","url":"https://mcp.etz… <- 502
POST /xrpc/a/b          {"error":"MCP router unreachable","url":"https://mcp.etz… <- 502
OPTS /xrpc/x            204
GET  /nope              404
POST /health            405
GET  /_app/meta         404
```

workerd が返したページの中身も確認した: `class="dads-table"` が 1、
`--color-primitive-blue` が **45** —— design system の CSS は実際に bundle に
入って配信されている。

`compatibility_flags`（`nodejs_compat` / `nodejs_als`）は SvelteKit の
adapter-cloudflare 由来で、この `:esm` bundle には要らない。**撤去は憶測では
なくこの実測で確かめてから行った。** Node で import する §5 の smoke より
強い証拠である（実際の Workers ランタイムで動かしているため）。

多段パス（`/xrpc/a/b`）が単一セグメントと**同じ 502** になっていることにも
注意 —— 移行前の rest parameter の挙動をそのまま保っている。

## 7. deploy

```bash
cd "$REPO" && npx wrangler deploy
```

**ただし route が指すホストは解決しない**（`air-mro.etzhayyim.com` /
`a1rmr001.etzhayyim.com` とも NXDOMAIN）。deploy が成功しても誰も到達できない。
`/xrpc/` の中継先 `mcp.etzhayyim.com` も同様なので、到達できたとしても中継は
**502 を返す**（成功と同じ形で隠さない）。

superproject の deploy guard は `origin/main` を含む checkout からの deploy
しか許さない点も併せて注意。**この移行では deploy していない。**

## 8. 走らせていないもの（飛ばした手順は合格した手順ではない）

- **`kotoba/` のテスト（12 tests）**。`npm install` が npm 11.16 の
  `EALLOWSCRIPTS` で通らない —— 2 つの git 依存の nested install が拒否される。

  ```
  npm error code EALLOWSCRIPTS
  npm error --allow-scripts is not allowed in project-scoped installs.
  ```

  これは「依存が無い」のではなく「手元の npm が入れられない」である。pin
  された 2 つの SHA は**実在する**ことを git で確認した（下記）。
- **`wrangler deploy`**（§7）。
- **`MIGRATION-TODO.md` の 7 項目の憲章適合レビュー**。文書自身が「未実施」
  かつ「ドメイン分類から導かれた項目であって検出された違反ではない」と書いている。

### pin された依存の存在は git に訊く

`gh api repos/<org>/<repo>/commits/<sha>` は**実在する commit に 404 を返す
ことがある**（この workspace で 2 度観測されている既知のハザード）。SHA の
存在が判断を左右するときは API ではなく git に訊く:

```bash
P=$(mktemp -d) && git init -q "$P" && cd "$P"
git fetch --quiet https://github.com/etzhayyim/com-etzhayyim-sdk.git \
  12314a0cc5ac2feb49dd9789d5c002398acb6988
git cat-file -t 12314a0cc5ac2feb49dd9789d5c002398acb6988    # -> commit
```

実測 2026-08-18: `com-etzhayyim-sdk` の `12314a0c…` と
`com-etzhayyim-sdk-mock` の `c857ff9b…` は**どちらも `commit` として取得
できた**。今回は `gh api` も同じ 2 つを返した（404 は再現しなかった）が、
判断の根拠にしたのは git の方である。
