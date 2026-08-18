(ns air-mro.view
  "この appview の説明ページ。純 hiccup。

  基盤は `jp-go-dds`(デジタル庁デザインシステム) —— superproject の
  skill `kotoba-uiux` が定める新規 UI の base。色・寸法は `--hig-*` トークン
  契約で書き、raw hex も px フォントサイズも置かない。

  **表示する事実は引数で受け取る。ページの中に焼かない。**
  これは装飾の都合ではなく、docs/adr/0001 が記録した欠陥そのものへの答えで
  ある —— 移行前のページ（`svelte/src/routes/+page.svelte`）は
  `\"routeCount\": 0` と `\"vars\": []` を literal で持っていて、隣の
  wrangler.jsonc が route 2・var 8 を宣言していることに気づけなかった。
  ここでは route 表と設定を渡す側が持ち、ページは描くだけなので、両者が
  ずれる余地が無い。"
  (:require [jp-go-dds.core :as dds]
            [jp-go-dds.page :as page]
            [jp-go-dds.tokens :as tokens]
            [clojure.string :as str]))

(def app-css
  "app 固有の最小 CSS。`--hig-*` 契約だけを使う(bridge が DADS の上に再定義する)。
  DADS を base にした app の下には `shitsuke.hig` が居ないので、bridge が運んで
  いないトークンは何にも解決しない —— 使うのは運ばれている 71 個の中だけ。"
  (str/join
   "\n"
   [".mro-lede { color: var(--hig-color-secondary-label); max-width: 42rem; }"
    ".mro-note { color: var(--hig-color-secondary-label); font-size: var(--hig-text-footnote-font-size); }"
    ".mro-mono { font-family: var(--hig-font-mono); }"]))

(defn- route-rows [routes]
  (mapv (fn [r]
          [(str/upper-case (name (:route/method r)))
           [:span {:class "mro-mono"} (:route/path r)]
           (:route/doc r)])
        routes))

(defn body
  "opts:
   :routes    air-mro.route/routes（この Worker が実際に答えるもの）
   :vars      wrangler が渡した env のキー（**キー名だけ**。値は出さない）
   :mcp-url   XRPC の中継先（route/mcp-router-url の戻り値。**値そのものを出す**）
   :built-at  bundle のビルド時刻（不明なら nil）"
  [{:keys [routes vars mcp-url built-at]}]
  (dds/container
   (dds/section
    {}
    (dds/heading 1 "Air Maintenance MRO")
    [:p {:class "mro-lede"}
     "航空機の整備・修理・オーバーホール（MRO）の appview 公開面。"
     "work order・部品トレース・耐空性確認といった業務そのものはここには無く、"
     "この Worker は XRPC を MCP router へ中継する BFF である。"])

   (dds/section
    {:title "この面が答えるもの"}
    (dds/table {:caption "公開ルート"
                :headers ["METHOD" "PATH" "何をするか"]
                :rows (route-rows routes)})
    [:p {:class "mro-note"}
     "この表は Worker の route 表そのものから描いている。ページに焼いた値では"
     "ないので、実際に答えるものと表示がずれない。"])

   (dds/section
    {:title "実行時の設定"}
    (if (seq vars)
      [:div (into [:p] (interpose " "
                                  (map (fn [k] (dds/chip-label (name k))) vars)))
       [:p {:class "mro-note"}
        "キー名のみ。**ただし下の中継先だけは値そのもの**（"
        [:span {:class "mro-mono"} "AGENTGATEWAY_MCP_ROUTER_URL"]
        "）—— どこへ中継するかは運用者が見る必要があるので意図的に出している。"
        "それ以外の値は出さない。"]]
      [:p {:class "mro-note"} "env が渡されていない（ローカル描画）。"])
    [:p {:class "mro-note"} "XRPC の中継先: "
     [:span {:class "mro-mono"} mcp-url]])

   (dds/section
    {:title "この Worker は operation を 1 つも名指ししない"}
    [:p {:class "mro-lede"}
     "path に来た NSID をそのまま MCP router へ tools/call として転送するので、"
     "この repo は「このアプリに何ができるか」を学ぶ場所ではない。実測: 移行前の "
     [:span {:class "mro-mono"} "+server.ts"] " に "
     [:span {:class "mro-mono"} "airMro"]
     " という文字列は 1 度も現れなかった（grep -c → 0）。移行後も同じで、"
     "operation の一覧は上流の MCP router 側にある。"]
    [:p {:class "mro-note"}
     "そのため " [:span {:class "mro-mono"} "APP_CAPABILITIES"]
     " は強制ではなく文書である。値はここに焼かない（キー名だけ上に出る）。"])

   (dds/section
    {:title "現在地"}
    [:p {:class "mro-lede"}
     "この appview は TypeScript/Svelte から ClojureScript へ移行済み。"
     "deploy される bundle は、いま読んでいるソースからコンパイルされたもので"
     "ある（docs/adr/0001）。"]
    (when built-at
      [:p {:class "mro-note"} "bundle build: " built-at]))))

(defn render
  "完全な HTML 文書。`css` は呼び出し側が渡す(ライブラリは I/O を持たない)。"
  [{:keys [css] :as opts}]
  (page/->page
   {:title "Air Maintenance MRO — appview"
    :description "航空機の整備・修理・オーバーホール（MRO）の appview 公開面。"
    :lang "ja"
    :css css
    :app-css (str tokens/bridge-css "\n" app-css)}
   (body opts)))
