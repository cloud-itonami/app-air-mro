# Operator quickstart — app-air-mro

22 tracked files: maintenance, repair and overhaul for an airline. Before reading any
of them, know that **the file that looks like the entry point is not the one that gets
deployed**, and that everything in §1–§4 below is true of **all nine `app-air-*`
repositories**, identically — this is a property of whatever generated them, not of
this repository.

Steps marked ✅ were run on 2026-08-16. §5 says what could not be walked and why; a
step that was skipped is not a step that passed.

---

## 1. ✅ The nine siblings are identical on every dimension that matters here

One command, run from `orgs/cloud-itonami/`:

```bash
python3 - <<'EOF'
import json,io,os,glob,re
def read(p):
    try: return io.open(p,encoding='utf-8',errors='ignore').read()
    except Exception: return ''
for d in sorted(glob.glob('app-air-*')):
    cfg=json.load(io.open(os.path.join(d,'wrangler.jsonc')))
    caps=json.loads(cfg['vars']['APP_CAPABILITIES'])
    hdr=[x.strip() for x in re.search(r'methods?:\s*(.+)',read(os.path.join(d,'src','app.ts'))).group(1).split('/')]
    sv=[p for p in glob.glob(os.path.join(d,'svelte','src','**','*'),recursive=True) if os.path.isfile(p)]
    rc=re.search(r'"routeCount":\s*(\d+)',read(os.path.join(d,'svelte','src','routes','+page.svelte')))
    print(f"{d:16} caps={len(caps)} hdr={len(hdr)} caps==hdr[:3]={caps==hdr[:3]}"
          f" routes={len(cfg.get('routes',[]))} pageRouteCount={rc.group(1) if rc else '?'}"
          f" healthInSvelte={any('/health' in read(p) for p in sv)}"
          f" todoUnchecked={read(os.path.join(d,'MIGRATION-TODO.md')).count('- [ ]')}")
EOF
```

Every one of the nine prints the same shape:

```
app-air-cargo  caps=3 hdr=8 caps==hdr[:3]=True routes=2 pageRouteCount=0 healthInSvelte=False todoUnchecked=7
app-air-crew   … app-air-dcs … app-air-ffp … app-air-mro … app-air-ops …
app-air-sched  … app-air-sms … app-air-yield  (identical on every field)
```

**`APP_CAPABILITIES` is not a curated public subset — it is the first three of eight,
in order, in 9 of 9 repositories**, across nine completely different domain
vocabularies. For this repository:

| declared in `APP_CAPABILITIES` | in the header list but not in `APP_CAPABILITIES` |
|---|---|
| `createWorkOrder` | `reportTechOccurrence` |
| `trackComponent` | `scheduleMaintenance` |
| `checkAirworthiness` | `reportReliability` |
| | `orderSparePart` |
| | `recordGroundEquipment` |

So a consumer reading the runtime var sees three of the eight operations this app says
it has, and the five it cannot see include occurrence reporting and reliability
reporting. Nothing in the repository says which list is authoritative.

## 2. ✅ What wrangler deploys, and what it does not

```bash
grep '"main"' wrangler.jsonc
#   "main": "svelte/.svelte-kit/cloudflare/_worker.js"
```

`main` is the **SvelteKit build output**. `src/app.ts` — 76 lines, the obvious place to
look, opening with `// 8 methods: createWorkOrder / trackComponent / …` and serving
`/health` and `/_app/meta` — is **not deployed**.

Verified by building the sibling `app-air-ffp`, whose tree is identical in this
respect: `npm install && npm run build` in `svelte/` succeeds (about 2 s), and
`grep -rl health .svelte-kit` finds **nothing** across the entire build output — that
is the whole deployable unit, since `_worker.js` is 4.3 KB and imports
`../output/server/index.js`. With `not_found_handling: "none"` in `wrangler.jsonc`, a
GET `/health` on the deployed worker is a **404**, so a monitor pointed there is
watching a path that does not exist.

To confirm it for this repository rather than by inheritance:

```bash
cd svelte && npm install --no-audit --no-fund && npm run build
grep -rl 'health' .svelte-kit          # expect: nothing
```

The deployed worker has exactly two routes:

```bash
find svelte/src/routes -type f | sed 's|svelte/src/routes||'
#   /+page.svelte
#   /xrpc/[...path]/+server.ts
```

## 3. ✅ The deployed handler names no operation at all

The xrpc route is one dense line. It takes whatever NSID is in the path, forwards it
to `AGENTGATEWAY_MCP_ROUTER_URL` (default
`https://mcp.etzhayyim.com/xrpc/com.etzhayyim.mcp.message`) as a JSON-RPC
`tools/call`, and returns `result.structuredContent` with `cache-control: no-store`.

```bash
grep -c 'airMro' svelte/src/routes/xrpc/'[...path]'/+server.ts   # 0
```

It serves **every** operation and **none**: the method list lives upstream in the MCP
router, and this worker would forward `com.etzhayyim.apps.anythingElse.doThing` just as
willingly. That is a deliberate BFF design — every forwarded request carries
`x-etzhayyim-bff: sveltekit-edge-bff` — but two consequences follow. This repository is
**not** where you learn what the app can do, and `checkAirworthiness` here is a name
routed onward, not an implementation to review. `APP_CAPABILITIES` is documentation
rather than enforcement.

## 4. ⚠ The landing page describes an app with no routes and no vars

`svelte/src/routes/+page.svelte` embeds a generated summary:

```javascript
{ "title": "Ai etzhayyim Project Air Mro", "routeCount": 0, "routes": [], "vars": [],
  "xrpc": true, "relativePath": "60-apps/etzhayyim-project-air-mro/svelte/src/routes/+page.svelte" }
```

`wrangler.jsonc` declares **two** route patterns (`a1rmr001.etzhayyim.com/*` and
`air-mro.etzhayyim.com/*`) and **eight** upper-case vars. The summary predates them or
came from a source without them, and its `relativePath` still points into the monorepo
this repository was extracted from. Nothing breaks; the page just describes something
else — in all nine siblings.

## 5. ⚠ The repository declares itself an unremediated seed, with its own caveat

`MIGRATION-TODO.md`:

> **Status**: 🔄 TRANSFORM — seed copied 2026-05-21, codemod pending.

Seven boxes, none ticked (`grep -c '^- \[ \]'` → 7, `'^- \[x\]'` → 0), listing
invariants described as "likely violated and MUST be remediated before this app can be
considered etzhayyim-aligned": replacing direct `@atproto/api` / `viem` / IPFS-client
imports with `@etzhayyim/sdk`, stripping centralized DB code, stripping fiat
processors, and a §2(a) military-use exclusion codemod.

**Read that file's last paragraph before treating the seven as findings**, because it
qualifies them itself:

> The TRANSFORM classification was based on the app's domain pattern (commerce /
> communication adapter / media etc.), not on detected violations. Manual review is
> still required to confirm Charter §2(a)-(h) and substrate-boundary compliance.

So the seven are a review checklist derived from the app's category, not seven
confirmed defects. What is certain is that the review has not happened, and that
`wrangler.jsonc` meanwhile declares live routes on `etzhayyim.com`.

## 6. ⚠ NOT WALKED: the kotoba test suite

`kotoba/` holds the real domain logic to check — `src/registry.ts` is **434 lines**
and `test/air-mro.test.ts` is **170 lines with 12 tests** — and it does not install
here:

```bash
cd kotoba && npm install
#   npm error code EALLOWSCRIPTS
#   npm error --allow-scripts is not allowed in project-scoped installs.
```

Both dependencies are git URLs (`@etzhayyim/sdk`, `@etzhayyim/sdk-mock`) whose
preparation runs a nested install that npm 11.16 refuses; adding an `allowScripts`
field does not help, because the rejection happens inside the nested install. The
sibling `cloud-itonami/app-air-crew`'s quickstart §5 documents a workaround and §8
records what it costs. Nothing here claims the suite passes.

`svelte/` installs and builds cleanly (§2) because it has no git dependencies.

**The nine siblings agree on the scaffolding and differ in the part that matters.**
Every field in §1 is identical across all nine, but this repository's registry is 434
lines against `app-air-ffp`'s 301, and 12 tests against its 8. The generated shell is
uniform; the domain logic is not. So the family-wide findings above transfer between
siblings and the contents of `kotoba/` do not — check that per repository.

## 7. The family's environment traps

`cloud-itonami/app-air-crew/docs/operator-quickstart.md` §0 documents these at length.
The short list, so you need not open it first:

1. **the remote is not `origin`** — west names remotes after the org, so it is
   `cloud-itonami`. `git fetch origin` fails with an access-rights error and
   `origin/main` does not resolve.
2. **`error: could not read IPC response` on stderr is the fsmonitor daemon**, not your
   command; it still succeeded. `-c core.fsmonitor=false` silences it.
3. **npm 11.16 cannot install the `kotoba/` git dependencies** (§6).
4. **`esbuild --loader=ts` is rejected** for a file input; drop the flag.
5. **there is no `.gitignore`** — building in the checkout leaves `node_modules/` and
   `.svelte-kit/` untracked. Build in a worktree, or clean up afterwards.

## 8. What the maturity instrument sees here ✅

```
· orgs/cloud-itonami/app-air-mro  own=0.049  axis-docs=0bp → +2500bp
    ⚠ README が .md ではないので docs の README 成分は 0（README.edn 等が 1 件）
    ⚠ taxonomy に :repo/kind の行が無い → :default の重みで採点されている
```

Both warnings are about the instrument. `README.edn` declares
`:canonical-metadata :edn` — EDN is deliberately canonical here — while the score reads
`README.md`. And this repository has no row in `manifest/repo-taxonomy.edn`, so it is
scored against a guessed weight profile and its `own` is not comparable to a repository
whose kind is known. Recorded in ADR-2608052000 and surfaced by the tick; not gaps to
close by adding a second README.
