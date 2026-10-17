@../../AGENTS.md
@AGENTS.md

Speed first; write tests only when necessary and important. Own backend code here;
keep the shared wire contract compatible with the frontend branch.

Run `pnpm dev:application` for persisted application APIs, or `pnpm dev:api`
for the synthetic fixture. Read `docs/application-api.md` before changing chat
submission, list pagination, evidence, maps or saved views. App-local dependency commands,
dataset/store isolation, focused checks and handoff rules are in this app's `AGENTS.md`.
For embedding storage integration, follow its embedding guidance and
`docs/document-embeddings.md`.
