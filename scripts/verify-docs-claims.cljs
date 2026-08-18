#!/usr/bin/env nbb
;; verify-docs-claims — re-derive every number README.md and docs/operator-quickstart.md
;; state, from the tree itself, and fail when the tree and the prose disagree.
;;
;; Before the cljs migration this file's load-bearing claim was a GAP: the Worker
;; that would be deployed was a SvelteKit build output ABSENT from the tree, while
;; src/app.ts -- the file that read like the application -- was in no bundle. That
;; gap is closed, so the claims assert the CLOSURE, and they are written so it
;; cannot quietly come back: the TypeScript is asserted ABSENT BY NAME, not merely
;; absent from a byte total.
;;
;; Usage:  nbb scripts/verify-docs-claims.cljs [<dir>]     (<dir> FIRST, default ".")
;; Exit:   0 every claim holds · 1 a claim is false · 2 could not answer

(require '["node:fs" :as fs]
         '["node:child_process" :as cp]
         '["node:crypto" :as crypto]
         '[cljs.reader :as reader]
         '[clojure.string :as str])

(def root (or (first (remove #(str/starts-with? % "--") *command-line-args*)) "."))

(def claims
  {:tracked-files 25
   :inherited-bytes 4370          ; the 5 inherited files still carried byte-identical
   :svelte-artifacts 0            ; no .svelte / svelte.config / svelte/ file survives
   :sveltekit-compat-flags 0      ; nodejs_compat / nodejs_als were adapter-cloudflare's
   :appview-ts-files 0            ; the appview's TypeScript is gone
   :domain-library-ts-files 5     ; kotoba/ is NOT the appview and was left alone -- pinned
   :production-canonical-files 4
   :declared-vars 8
   :declared-routes 2
   :wrangler-main "dist/worker.js"
   :shadow-output-dir "dist"
   :shadow-export "air-mro.worker/handler"})

;; Inherited files this repository still carries BYTE-IDENTICAL. wrangler.jsonc is
;; deliberately NOT in this set (the migration changed main / assets / APP_FRAMEWORK /
;; compatibility_flags) and is checked by content below instead. docs/operator-quickstart.md
;; is likewise rewritten by the migration. The point of the split is to keep
;; "changed on purpose" distinguishable from "changed by accident".
(def preserved
  {"MIGRATION-TODO.md" "f9c3820c888e074f99ffa01ca609d11f5ac66400e4732973e268bad3bf8d682c"
   "NOTICE" "9d3bd5678f857c647a465987cd8538580215416648991fd9de47e6dc648544f0"
   "README.edn" "2bead9787ebbd2ad3e58099515a4666c4c7b704bdcae6a929367d826c636a035"
   "kotodama.jsonld" "a64d52299d4d01950f130a375bf5eba1879e77b1f9fb910f3942f09c4a603207"
   "migration.edn" "f6fd1ea2a02d0541ae989c1ea53b3e2b6c48956173d267ae68bb8b20c76f5c6e"})

;; What the migration REMOVED, by name. A byte total cannot say "the TypeScript is
;; gone"; this can, and it fails if any of it comes back.
(def removed-by-migration
  ["src/app.ts"
   "package.json"
   "svelte/package.json"
   "svelte/svelte.config.js"
   "svelte/tsconfig.json"
   "svelte/vite.config.ts"
   "svelte/src/app.html"
   "svelte/src/routes/+page.svelte"
   "svelte/src/routes/xrpc/[...path]/+server.ts"])

;; The TypeScript the migration deliberately did NOT touch. kotoba/ is a
;; self-contained domain library: it is in no bundle, nothing in the appview
;; references it, and its two pinned git dependencies resolve (both SHAs fetched
;; as type=commit -- see README "What this migration did not touch"). Deleting it
;; on a templated "remove all TypeScript" reading would have been destruction, not
;; migration. The file list is pinned so it cannot grow silently either.
(def domain-library-files
  ["kotoba/package.json"
   "kotoba/tsconfig.json"
   "kotoba/vitest.config.ts"
   "kotoba/src/index.ts"
   "kotoba/src/registry.ts"
   "kotoba/src/types.ts"
   "kotoba/test/air-mro.test.ts"])

(def undetermined (atom []))
(def failures (atom []))
(defn undet! [m] (swap! undetermined conj m))

(defn tracked-files []
  (try (->> (.execSync cp "git -c core.fsmonitor=false ls-files"
                      ;; -c core.fsmonitor=false: an unhealthy fsmonitor daemon
                      ;; prints "error: could not read IPC response" on stderr for
                      ;; many git calls in this workspace. Harmless, but it makes
                      ;; the output of a passing run look like a failing one.
                      #js {:cwd root :encoding "utf8"})
            str/split-lines (remove str/blank?) vec)
       (catch :default e (undet! (str "git ls-files failed: " (.-message e))) nil)))
(defn slurp* [rel] (try (.readFileSync fs (str root "/" rel) "utf8") (catch :default _ nil)))
(defn bytes-of [rel] (try (.-size (.statSync fs (str root "/" rel))) (catch :default _ nil)))
(defn sha256 [rel]
  (try (-> (.createHash crypto "sha256") (.update (.readFileSync fs (str root "/" rel))) (.digest "hex"))
       (catch :default _ nil)))
(defn strip-jsonc [s]
  ;; only whole-line // comments; a // inside a string would be mangled otherwise
  (str/replace s #"(?m)^\s*//.*$" ""))

(defn check! [label expected actual]
  (let [ok (= expected actual)]
    (println (str (if ok "PASS" "FAIL") "\t" (name label)
                  "\texpected=" (pr-str expected) "\tactual=" (pr-str actual)))
    (when-not ok (swap! failures conj label))
    ok))

(let [files (tracked-files)]
  (when (nil? files) (println "UNDETERMINED\tcould not list tracked files") (js/process.exit 2))
  (println (str "SCANNED\t" (count files)))
  (when (zero? (count files)) (println "UNDETERMINED\tscanned 0 files") (js/process.exit 2))

  (let [sizes (into {} (map (juxt identity bytes-of)) files)]
    (when-let [bad (seq (keep (fn [[f s]] (when (nil? s) f)) sizes))]
      (undet! (str "tracked but unreadable: " (str/join ", " bad))))

    (check! :tracked-files (:tracked-files claims) (count files))
    (check! :inherited-bytes (:inherited-bytes claims)
            (reduce + 0 (keep #(get sizes %) (keys preserved))))
    (check! :preserved-files-unchanged []
            (vec (keep (fn [[f want]] (let [got (sha256 f)]
                                        (when-not (= want got) (str f " " (or got "MISSING")))))
                       preserved)))

    ;; the appview's TypeScript is gone, by name
    (check! :removed-by-migration-absent []
            (vec (filter #(some? (bytes-of %)) removed-by-migration)))

    ;; Svelte is gone and must not come back. removed-by-migration names the files;
    ;; this catches a return under ANY name -- a new .svelte file, a svelte.config,
    ;; or a svelte/ directory.
    (check! :svelte-artifacts (:svelte-artifacts claims)
            (count (filter #(or (str/ends-with? % ".svelte")
                                (str/includes? % "svelte.config")
                                (str/includes? % "/svelte/")
                                (str/starts-with? % "svelte/"))
                           files)))

    ;; language of the production source. Two DIFFERENT numbers, because this repo
    ;; holds TypeScript that is not the appview: the appview's count must be 0, and
    ;; the domain library's count is pinned so it cannot grow silently.
    (let [prod (remove #(str/starts-with? % "scripts/") files)
          ts (filter #(str/ends-with? % ".ts") prod)]
      (check! :appview-ts-files (:appview-ts-files claims)
              (count (remove #(str/starts-with? % "kotoba/") ts)))
      (check! :domain-library-ts-files (:domain-library-ts-files claims)
              (count (filter #(str/starts-with? % "kotoba/") ts)))
      (check! :domain-library-intact []
              (vec (remove #(some? (bytes-of %)) domain-library-files)))
      (check! :production-canonical-files (:production-canonical-files claims)
              (count (filter #(re-find #"\.(cljs|cljc|clj|kotoba)$" %) prod))))

    ;; the deployed bundle is built from the source in this tree
    (let [w (some-> (slurp* "wrangler.jsonc") strip-jsonc)
          sh (slurp* "shadow-cljs.edn")]
      (if (or (nil? w) (nil? sh))
        (undet! "wrangler.jsonc or shadow-cljs.edn unreadable")
        (let [j (js->clj (.parse js/JSON w) :keywordize-keys false)]
          (check! :wrangler-main (:wrangler-main claims) (get j "main"))
          (check! :declared-vars (:declared-vars claims) (count (get j "vars")))
          (check! :declared-routes (:declared-routes claims) (count (get j "routes")))
          ;; the old config served a SvelteKit client dir that no longer exists
          (check! :no-stale-assets-binding true (nil? (get j "assets")))
          (check! :sveltekit-compat-flags (:sveltekit-compat-flags claims)
                  (count (filter #{"nodejs_compat" "nodejs_als"}
                                 (or (get j "compatibility_flags") []))))
          (check! :app-framework-not-sveltekit true
                  (not (str/includes? (str (get-in j ["vars" "APP_FRAMEWORK"])) "svelte")))
          (check! :shadow-builds-that-main true
                  (and (str/includes? sh (str ":output-dir \"" (:shadow-output-dir claims) "\""))
                       (str/includes? sh (:shadow-export claims))
                       (str/includes? (get j "main") (str (:shadow-output-dir claims) "/worker.js"))))
          ;; :warnings-as-errors must sit under :compiler-options. shadow reads
          ;; [:compiler-options :warnings-as-errors]; under :build-options it is
          ;; SILENTLY IGNORED -- which is the very failure the option prevents, a
          ;; check that cannot fail. Measured in this repo on 2026-08-18: with the
          ;; key misplaced, a build carrying an undeclared var exited 0 and shipped
          ;; a bundle that threw "Cannot read properties of undefined" on import.
          ;; PARSED, not grepped -- a grep is satisfied by the comment above.
          (let [edn (try (reader/read-string sh) (catch :default e (undet! (str "shadow-cljs.edn unreadable as EDN: " (.-message e))) nil))]
            (when edn
              (check! :warnings-as-errors-under-compiler-options true
                      (true? (get-in edn [:builds :worker :compiler-options :warnings-as-errors])))
              (check! :warnings-as-errors-not-under-build-options nil
                      (get-in edn [:builds :worker :build-options :warnings-as-errors])))))))

    ;; The page renders the route TABLE rather than a baked count -- the defect
    ;; ADR-0001 recorded was a literal `routeCount: 0` beside a config declaring
    ;; two. Asserted structurally (the view takes :routes, the worker passes the
    ;; real table) and NOT by forbidding a substring: a check that a docstring
    ;; explaining the old defect can trip is a check about prose.
    (let [v (slurp* "src/air_mro/view.cljc")
          w (slurp* "src/air_mro/worker.cljs")]
      (if (or (nil? v) (nil? w))
        (undet! "view.cljc or worker.cljs unreadable")
        (do
          (check! :page-renders-route-table true
                  (and (str/includes? v "[{:keys [routes vars mcp-url built-at]}]")
                       (str/includes? v "(route-rows routes)")
                       (str/includes? w ":routes route/routes")))
          ;; the design system CSS is actually inlined into the bundle
          (check! :stylesheet-inlined-at-build true
                  (str/includes? w "(rc/inline \"jp_go_dds/dds.css\")")))))

    ;; every ADR is readable EDN tx-data
    (let [adrs (filter #(re-find #"^docs/adr/.*\.edn$" %) files)]
      (check! :adr-count 1 (count adrs))
      ;; Read the WHOLE file, not just its first form. `cljs.reader/read-string`
      ;; consumes one form and DISCARDS the rest, so a check written as
      ;; (read-string s) stays green on a file that is not valid EDN -- appending
      ;; `{:unbalanced "` to this ADR passed. Measured here on 2026-08-18 before
      ;; this was fixed: the check could not fail. Wrapping in [] makes trailing
      ;; content either a second form (counted) or a reader error (caught).
      (check! :adrs-read-as-edn []
              (vec (keep (fn [f]
                           (let [s (slurp* f)]
                             (if (nil? s)
                               (str f " unreadable")
                               (let [forms (try (reader/read-string (str "[" s "\n]"))
                                                (catch :default _ ::bad))]
                                 (cond
                                   (= forms ::bad) (str f " does not read as EDN")
                                   (not= 1 (count forms))
                                   (str f " has " (count forms) " top-level forms (expected exactly 1)")
                                   :else
                                   (let [d (first forms)]
                                     (cond
                                       (not (vector? d)) (str f " is not tx-data (expected a vector)")
                                       (not= 1 (count d)) (str f " expected exactly 1 entity, got " (count d))
                                       (not (map? (first d))) (str f " entity is not a map")
                                       (not (:adr/id (first d))) (str f " has no :adr/id")
                                       (not (:adr/status (first d))) (str f " has no :adr/status")
                                       (not (:adr/body (first d))) (str f " has no :adr/body")
                                       :else nil)))))))
                         adrs))))))

(let [u @undetermined f @failures]
  (when (seq u)
    (doseq [m u] (println (str "UNDETERMINED\t" m)))
    (println "Refusing to report a pass: the tree could not be read completely.")
    (js/process.exit 2))
  (if (seq f)
    (do (println (str "FAILED\t" (count f) " claim(s): " (str/join ", " (map name f)))) (js/process.exit 1))
    (do (println "OK\tevery claim in README.md and docs/operator-quickstart.md holds") (js/process.exit 0))))
