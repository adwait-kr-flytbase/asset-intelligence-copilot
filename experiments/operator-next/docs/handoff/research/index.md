> Historical research snapshot from17October2026. References to retired lab code, split layouts, local captures or an A2UI baseline are historical; current decisions/architecture in the parent folder take precedence. Vendor findings are dated, not a fresh compatibility guarantee. Raw third-party captures are not bundled.

# Generative UI research packet

Requested by the user on 2026-10-17: in-depth state-of-the-art generative UI research, including A2UI, maintained with task-factory and evidence.

## Reading order

1. [Main report](report.md): findings, taxonomy, A2UI deep dive, protocol boundaries, recent research, project recommendation and evaluation plan.
2. [Framework comparison](frameworks.md): AI SDK UI/RSC, json-render, CopilotKit, assistant-ui, Tambo, Thesys C1/OpenUI and LangGraph.
3. [Source ledger](sources.md): primary URLs and retained bodies.
4. [Claim audit](claims.md): consequential claims, evidence strength, conflicts and retry conditions.
5. [Independent research review](review.md): findings and correction status; this is not an implementation delivery review.
6. `Verification results` (unbundled capture): local link and retained-body integrity checks.

## Task-factory state

- Root: `.context/generative-ui-worktree/.context/generative-ui-research` relative to the original repository.
- Worktree: `.context/generative-ui-worktree`, branch `research/generative-ui`.
- Frozen base: `b7baf48860f89aa4f5fef491e357f3ff7cd828f2`.
- Workflow: simple. Phase: exploring; research deliverable finished, no application implementation admitted or claimed.
- [Context](../context.md), [decisions](../decisions.md), [research verification scope](../verification.md), [journal](../events.jsonl).
- No merge, push or deployment. No packet deletion. Existing original-checkout documentation edit preserved.

Reproduce the local research audit with `python3 evidence/verify_research.py` from the packet directory. It checks retained source hashes, retrieval coverage and local research links; it does not verify application behavior or the truth of every source claim.

## Visual companion

[Open the self-contained HTML guide](../../../../generative-ui.html). [Coverage and browser verification](html-guide.md).

## Operator experience research — 2026-10-17

- [Desktop, mobile, history and future voice](operator-experience-2026-10-17.md): operator-specific recommendations, lab gaps, history/result semantics and evaluation tasks.
- [Current product UX patterns](product-ux-patterns-2026-10-17.md): six first-party product profiles and their limitations.

This UX research supplements the protocol/framework survey. No application changes or final operator-design approval are implied.
