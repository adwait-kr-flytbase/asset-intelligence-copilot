# Fieldwork: Generative UI lab

A disposable experiment for an agent that assembles useful operational investigations, with evidence and reliable interactions. This app is separate from the real frontend and API. **All records are synthetic.**

## Run

Use Node **22.22.3** and pnpm **11.20.0**, matching the repository.

```sh
cd experiments/generative-ui-lab
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:3200/**. Demo Hono health: **http://127.0.0.1:3201/api/health**. Both bind to loopback. Occupied ports fail rather than silently selecting another. Stop both with Ctrl+C.

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

## Start experimenting

1. Open the demo and click a starter question. The default is **scripted synthetic answers**; the free composer also recognizes well-attention, downtime and spill requests. Unsupported questions receive an explanation, never a silent unrelated answer.
2. Read the answer in the conversation and use **Open result** to explore its data. Desktop keeps conversation and data alongside each other. Mobile has **Conversation / Data** destinations with the same reachable composer.
3. Open evidence, select a well and filter by area. The scope note explains that area filters the views while answer summaries cover all six wells. Downtime includes trends; spills includes a heatmap.
4. Use **History** to search, rename and reopen investigations. All messages and completed answer snapshots survive reload on this browser/device. Open any earlier answer, then **Back to latest result**. Scrolling messages does not change the displayed result. **Refresh answer** appends a new answer; it does not rewrite an old one.
5. **Show as table** appends a representation change without a model call, retaining result values and sources.
6. Open **Lab settings** for generation mode, official A2UI/direct renderer, invalid/slow update injection, local observation draft, diagnostics and sanitized experiment export. Choose a fault, close settings and refresh an answer to exercise it. Stop/invalid updates retain the last complete displayed result and mark the attempt in history.
7. Use **New investigation** for a separate conversation. History remains available. There is no account, cross-device sync or production persistence. Browser storage is not suitable for enterprise data retention; this isolated lab contains synthetic records only.

The demo intentionally has no microphone button. Future voice should use the same conversation, selected context and results, with transcript, interruption and touch fallbacks; it requires a separate functional implementation.

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

- [Architecture and wire flow](docs/architecture.md)
- [Decision log](docs/decisions.md)
- [Experiment observations and worksheet](docs/experiments.md)
- [Verification and limitations](docs/verification.md)

No production framework decision follows automatically from this experiment.
