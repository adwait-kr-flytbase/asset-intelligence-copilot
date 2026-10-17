> Historical research snapshot from17October2026. References to retired lab code, split layouts, local captures or an A2UI baseline are historical; current decisions/architecture in the parent folder take precedence. Vendor findings are dated, not a fresh compatibility guarantee. Raw third-party captures are not bundled.

# Independent research review

Reviewed: 2026-10-17. Scope: `report.md`, companion `frameworks.md`, local project requirements, and captured primary-source evidence. This is an editorial and technical research review during exploration, not a task-factory implementation admission, conformance test, or formal delivery approval.

## Assessment

No blocking technical or evidentiary findings in the synthesis. The main protocol distinctions, maturity qualifications, and proposed project architecture are supported by the retrieved material. Fix the two broken project-document links before delivery. Two additional wording refinements would make the version and evidence boundaries clearer.

## Findings

### Medium — two project-document links escape the repository

Locations: section 1, “project requirements”; section 9, “the repository's example questions.”

Both targets currently begin `../../../../../../docs/`. Resolved from the report directory, they point into `/Users/flytermac26/projects/flytbase/hackathon/docs/`, where the files do not exist. The actual files are inside `asset-intelligence-copilot/docs/`.

Exact corrections:

- `../../../../../docs/problem-statement/problem-statement.md`
- `../../../../../docs/problem-statement/example-questions.md`

The relative links to `frameworks.md`, `sources.md`, and `../evidence/sources.json` resolve successfully. `sources.md` was absent during the first read but was present during the subsequent link check; this appears to be concurrent report assembly, not a remaining finding.

### Low — distinguish the A2UI site matrix from verified adapter/package compatibility

Locations: section 1 renderer-status bullet; section 8.4 declarative shortlist; companion framework sources F11 and F13.

The renderer matrix really does label React, Lit, Angular, and Flutter stable for v0.9.1 and planned for v1.0. However, the CopilotKit guide used in the companion report describes v0.9 operations. Neither source alone establishes that a selected CopilotKit package, backend adapter, and custom catalog implement the exact v0.9.1 combination proposed here. The report already labels the shortlist a recommendation and says to test integrations, so this is not a false capability claim; an explicit caveat would prevent readers from flattening those distinctions.

Suggested sentence after section 8.4 item 2:

> The A2UI site's renderer matrix is a documentation claim; the exact CopilotKit package/backend combination has not been checked for v0.9.1 compatibility. Its cited integration examples use v0.9, so verify the wire version and catalog against the selected release.

### Low — explain which source families have reproducible local snapshots

Locations: section 10 and companion `frameworks.md` evidence ledger.

The main retrieval manifest preserves protocol, research-abstract/paper, and lifecycle sources with hashes. Framework sources F01–F27 have URLs, access date, and short evidence anchors, but the companion explicitly states it has no commit snapshots. The main report does not claim every source was archived, but readers may assume one manifest covers the full investigation.

Suggested addition to section 10:

> The retrieval manifest covers the P/R/L sources listed there. Framework F-series sources were inspected live and recorded with access dates and extracts, without local body snapshots; recheck their interfaces before implementation.

## Specific technical checks

- **A2UI current/candidate status:** P01 identifies v0.9.1 as current production, v0.9 as previous stable, v0.8 as legacy, and v1.0 as candidate. The report faithfully attributes these to the official pages rather than asserting independently measured stability.
- **Homepage versus candidate discrepancy:** independently confirmed in the saved bodies. P01 mentions `actionResponse` and `surfaceProperties`; neither identifier occurs in P03. P03 instead describes `callRendererFunction`, `callAgentFunction`, `rendererFunctionResponse`, and `agentFunctionResponse`, as well as single-message instantiation and decoupled branding. The report correctly flags the disagreement instead of merging the two accounts into a fictitious API.
- **Date qualification:** P02 presents current-production metadata alongside a December 2025 “Last Updated” field; P03 reports June 2026. Avoiding inferred release chronology is justified. The report does not invent a release date.
- **Minimal lifecycle example:** message envelope, version string, root component, `Text.text`, and catalog identifier match the P02 examples. The specification explicitly says a catalog ID is an agreed identifier rather than necessarily a downloadable URL. Calling the snippet illustrative and untested is appropriate.
- **Data replacement:** P02 says `updateDataModel` replaces the value at its path and replaces the entire model when the path is absent or `/`. The report's warning about parent replacement losing sibling state is accurate.
- **Actions and synchronization:** P07 documents the v0.8 `userAction` to v0.9 `action` change, local functions versus agent events, server data-integrity checks, and optional data-model attachment to outgoing transport envelopes. The report's scope/privacy warning is a recommendation consistent with the full-model synchronization behavior.
- **Transport maturity:** P06 labels A2A/AG-UI stable, REST planned, and WebSockets/SSE proposed. The report correctly distinguishes that guide's integration status from the feasibility of delivering JSON through a custom transport.
- **AG-UI:** P12 supports RFC 6902 state deltas and snapshots and separately labels draft proposals. The report appropriately avoids a fixed event-count guarantee and treats resume/idempotency as application requirements.
- **MCP Apps:** the dated P13 source explicitly specifies `ui://`, the MIME profile, tool metadata, sandboxing, and a standard text-only tool fallback without app support. P09/P10 support the two embedding directions. No universal host parity is asserted.
- **Lifecycle findings:** Tambo closure dates and closed signups match L01 and the dated company announcement. C1 archive/new-project direction matches L02. The report does not incorrectly say the C1 endpoint has already stopped.

## Project fit and limitation checks

The local requirements explicitly require inline cards, tables, line/bar charts, maps, heatmaps, user-selected overrides, evidence, corrections, shared knowledge, and private memory. The proposed trusted-component architecture addresses those requirements without claiming a permanently fixed dashboard satisfies them. The report also preserves the distinction between formal corrections and contradictory ordinary notes, and keeps downtime tied to inspections rather than repair duration.

The evaluation plan maps the major examples correctly, includes unseen/missing data behavior, and identifies future checks rather than claiming they ran. Its catalog/action/backend separation is a defensible proposal, not a protocol-provided guarantee. Numerical paper findings remain attributed and qualified; this review did not independently reproduce experiments or audit every full-text paper statistic. No performance winner, package-level conformance, cloud economics, or production-readiness claim should be inferred from this review.

The companion framework ledger is appropriately cautious about inaccessible legacy C1 detail pages, evolving assistant-ui subpackages, vendor reliability claims, and Tambo maintenance ownership. The optional snapshot caveat above would make that caution easier to discover from the synthesis alone.

## Follow-up verification and resolution

Independently rechecked on 2026-10-17 after the author's revisions. Historical findings above are retained as the review record; they no longer describe unresolved defects.

- **Broken project links — resolved.** Both report links now use five `../` segments and resolve to the actual problem statement and example questions inside the repository.
- **CopilotKit version caveat — resolved.** The end of section 5 now explicitly says the inspected examples use v0.9-era messages and do not verify the proposed v0.9.1 package/adapter/catalog/renderer combination. It directs the experiment to resolve that exact combination.
- **Framework snapshot gap — resolved by additional evidence capture.** The manifest now includes all F01–F27 sources alongside P/R/L entries and the four arXiv full-text snapshots (`R03-full` through `R06-full`). The earlier recommendation to disclose a missing F-series archive is superseded; that archive now exists. The companion introduction correctly identifies F01–F27.

Ran `python3 evidence/verify_research.py` from the packet context using its full path. The audit returned `ok: true`, **54 sources / 54 successful retrievals**, matching SHA-256 hashes and byte lengths, unique source IDs, **70 valid local Markdown targets**, and all required research artifacts present. A separate manifest check confirmed complete F01–F27 coverage and the full-text paper entries. This is independent artifact verification; it does not reproduce the papers, execute the illustrative protocol snippet, validate package compatibility, or establish every published claim's truth.

**Current disposition: no unresolved blocking or medium findings.** The recorded protocol discrepancies and untested package/runtime behavior remain explicitly stated research limitations.
