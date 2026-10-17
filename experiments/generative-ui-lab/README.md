# Fieldwork: Generative UI lab

A disposable experiment for an agent that assembles useful operational investigations, with evidence and reliable interactions. This app is separate from the real frontend and API. **All records are synthetic.**

## Run

Use Node **22.22.3** and pnpm **11.20.0**, matching the repository.

```sh
cd experiments/generative-ui-lab
pnpm install --frozen-lockfile
pnpm dev
```

Review the final operator direction at **http://127.0.0.1:3200/operator**. Compare **http://127.0.0.1:3200/conversation** (continuous chat with inline interactive visuals and a past-chat sidebar) with **http://127.0.0.1:3200/** (split chat/workspace). Demo Hono health: **http://127.0.0.1:3201/api/health**. Both bind to loopback. Occupied ports fail rather than silently selecting another. Stop both with Ctrl+C.

This is a nested pnpm project with its own workspace file, dependencies and lockfile. It is intentionally outside the root workspace's `apps/*` and `packages/*`. Install and run from this directory, or use `pnpm --dir experiments/generative-ui-lab <command>` from the repository root. Root `pnpm dev` does not start this lab. Nothing imports or changes the existing web app, API or shared contracts.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Web and Hono demo backend together |
| `pnpm dev:web` / `pnpm dev:api` | Start either process independently |
| `pnpm typecheck` | Check client, server and targeted checks |
| `pnpm build` | Build client into `dist/` and API into `dist-server/` |
| `pnpm test:critical` | Critical presentation/provider/request boundaries |
| `pnpm start:api` | Start built demo backend |
| `pnpm preview` | Inspect built web assets, proxying to the demo backend |
| `pnpm audit` / `pnpm peers check` | Inspect nested dependencies |

Override ports in the shell or lab-local `.env`:

```sh
LAB_WEB_PORT=3210 LAB_API_PORT=3211 pnpm dev
```

## Operator components and backend handoff

The operator page now includes a real interactive map, multiple temperature series, ranked cost/downtime comparisons, drillable heatmaps, compliance states/deadlines, evidence timelines, competing claims and read-only correction review. Open **Explore maps, costs and operational evidence**, or choose **Explore another view** above the composer. These run the same pipeline and can be explicitly saved.

Give the backend agent [the backend handoff](docs/backend-handoff.md). It includes proposed production payloads, required tool data/evidence, scope/freshness semantics, operator-controlled writes, saved read execution and integration acceptance. [The component catalog](docs/component-catalog.md) maps UI needs to typed data. Proposed wire schemas and eight synthetic payload examples are executable in this lab; actual API/shared contracts remain unchanged.

```sh
pnpm exec tsx scripts/validate-backend-handoff.ts
```

Map tiles come from OpenStreetMap with attribution; the record list/evidence works when tiles are unavailable. All coordinates and records are synthetic. Approve an enterprise tile provider before using real asset locations.

## Operator review

Open `/operator`. Ask for an inspection overview, inspect sources, and choose **Save view** only when you want reuse. Select the panels and name it. Until explicitly saved, every ordinary question—including a repeat or text-only follow-up—uses the Hono chat pipeline.

Open a saved view from the sidebar (mobile: **Library**). Change its well, inspection count or trend dates, then **Apply**. Controls appear only for the saved panel bindings. **Refresh** reruns the applied parameters, even if an unsubmitted draft is invalid. Results retain their original well/time while loading or after failure. Reopening uses saved defaults; applying a temporary override does not edit them. Try `Use my "Morning check" for LAB-W04` with your actual saved name: the same read endpoint runs without layout generation. Additional analysis or unrelated questions return to the chat pipeline. **Explain results** starts a fresh investigation for the selected well.

Chat history, explicitly saved definitions and last completed runs are separate browser-local data. A saved definition contains a read recipe/composition/defaults, never a copied narrative or result values. Both persistence failures and invalid stored content are surfaced. This remains a synthetic preview, with no enterprise identity or durable multi-user storage.

The [product architecture](docs/product-architecture.md) and [minimum capability matrix](docs/scenario-coverage.md) cover the full example-question capability range without treating those examples as a fixed question catalog. The fixture adapter does not demonstrate those end-to-end agent capabilities.

## Start experimenting with the earlier comparison pages

1. Open the demo and click a starter question. The default is **scripted synthetic answers**; the free composer also recognizes well-attention, downtime and spill requests. Unsupported questions receive an explanation, never a silent unrelated answer.
2. The first answer opens its data. Later questions keep that workspace in place and offer **Show this result** in the conversation when a different view is prepared. Desktop keeps conversation and data alongside each other. Mobile has **Conversation / Data** destinations with the same reachable composer.
3. Open evidence, select a well and filter by area. The scope note explains that area filters the views while answer summaries cover all six wells. Downtime includes trends; spills includes a heatmap.
4. Try **Why this status?**, **How is downtime calculated?** or **Any conflicting records?** beneath an answer. These scripted snapshot explanations use the selected well and include source links; they make no model/surface call and leave charts, filters, selection and canvas scroll intact.
5. Use **History** to search, rename and reopen investigations. All messages and completed answer snapshots survive reload on this browser/device. Open any earlier answer, then **Show latest result**. Scrolling messages does not change the displayed result. **Refresh answer** appends a new answer; it does not rewrite an old one.
6. **Show as table** appends a representation change without a model call, retaining result values and sources.
7. Open **Lab settings** for generation mode, official A2UI/direct renderer, invalid/slow update injection, local observation draft, diagnostics and sanitized experiment export. Choose a fault, close settings and refresh an answer to exercise it. Stop/invalid updates retain the last complete displayed result and mark the attempt in history.
8. Use **New investigation** for a separate conversation. History remains available. There is no account, cross-device sync or production persistence. Browser storage is not suitable for enterprise data retention; this isolated lab contains synthetic records only.

On mobile, a new reply is signaled on Conversation without navigating away from Data. Partial updates do not replace an existing workspace; only a complete explicitly requested update or an opened result can change it. General live questions still prepare a validated visual plan; the three snapshot explanations are bounded scripted follow-ups, not a general conversational agent.

The demo intentionally has no microphone button. Future voice should use the same conversation, selected context and results, with transcript, interruption and touch fallbacks; it requires a separate functional implementation.

## Continuous chat comparison

Open `/conversation` or choose **Continuous chat** in the comparison navigation. Every visual answer renders its actual interactive A2UI/direct composition inside the message: charts, tables, maps and source actions remain in the conversation. New answers append; they do not require opening a separate canvas. The current partial surface appears in the pending answer, and Stop removes that incomplete surface while retaining earlier completed turns.

Past chats appear in the desktop sidebar with search and New chat. On mobile, **History** opens the same accessible saved-chat dialog. The composer stays reachable. Both pages use the same browser-local messages/results and Hono service; switching pages is explicit full-page navigation and can interrupt a running response. Try the same saved chat in both layouts.

Each inline result keeps its own in-session area and well selection. Selecting a well/area or **Use for follow-ups** makes that result the context for the next question; the composer names the result, area and well. Other inline results retain their own controls and original values. Only the currently focused result's scope is persisted on the thread; other in-session scopes return to their defaults on reload. Full per-result filter persistence is future work. Text-only snapshot explanations remain inline and retain their original source context.

The current stream progressively adds views from the permitted query/view catalog. It still uses synthetic data and scripted offline composition; no real general agent/model quality is demonstrated. A large transcript renders all historical visuals in this prototype; pagination/virtualization and production history are out of scope.

## Optional live model generation

Copy `.env.example` to `.env` **inside this directory** and configure a compatible chat-completions provider:

```dotenv
LAB_MODEL_BASE_URL=https://your-compatible-provider.example/v1
LAB_MODEL=your-model-name
LAB_MODEL_API_KEY=
```

Use HTTPS remotely; HTTP is permitted for loopback local providers. The base URL must not contain credentials, query parameters or a fragment. A key is optional for local providers that do not require authentication. Restart `pnpm dev` after changing configuration. Do not use `VITE_*` for secrets.

In **Lab settings**, select **Live model generation** and ask a question within the three supported investigations. The backend sends the current prompt, explicit visible area/selected-well/result context and the small permitted presentation vocabulary. It requests a JSON object `{ "query": "attention|downtime|spills", "views": [...] }` from `POST <base>/chat/completions` using `response_format: json_object`, `max_tokens: 500` and `stream: false`. A provider must support those options; provider-specific adapters are outside this first experiment.

The model selects a deterministic lab query and the order/set of trusted views. The backend retrieves the synthetic result and projects the validated choice into A2UI 0.9.1 messages. **The model does not generate raw A2UI wire messages in this experiment.** This isolates composition from protocol syntax. Both model output and offline replay enter the same validation/rendering boundary. The model cannot submit new result values, source IDs, executable code or arbitrary queries.

AI SDK streams the UI envelope progressively. The current provider call returns a complete small composition before the backend emits the first surface; token-by-token model layout generation is not implemented. Provider errors, malformed output and missing configuration are explicit; no silent replay fallback occurs.

A real provider/model run requires your local configuration. Automated checks use a localhost provider stub and do **not** establish real-model quality, latency or compatibility. This lab has no production authentication or memory; keep it on loopback with synthetic data.

## Read next

- [Product architecture and generalization](docs/product-architecture.md)
- [Minimum capability coverage](docs/scenario-coverage.md)
- [Architecture and wire flow](docs/architecture.md)
- [Decision log](docs/decisions.md)
- [Experiment observations and worksheet](docs/experiments.md)
- [Verification and limitations](docs/verification.md)

No production framework decision follows automatically from this experiment.
