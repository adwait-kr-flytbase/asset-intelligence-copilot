> Historical research snapshot from 17 October 2026. Preserved for technology reasoning and primary links. References to the retired lab, split-screen UX, local capture paths or an A2UI baseline are historical, not current implementation instructions. See ../decisions.md and ../architecture.md for the retained Fieldwork design. Vendor capabilities were checked at the original research date; adoption must recheck relevant versions. Raw third-party page captures are intentionally not bundled.

# Consequential claims and evidence quality

Date: 2026-10-17. Observations below are bounded by retained first-party pages. Recommendations are marked explicitly.

| Claim | Evidence | Assessment / boundary |
| --- | --- | --- |
| A2UI v0.9.1 is current production; v1.0 candidate | P01, P02, P03 | Explicit documentation status; no runtime guarantee |
| React/Lit/Angular/Flutter v0.9.1 stable, v1 planned | P04 | Maintainer support matrix; no integration execution |
| Candidate summary and detailed spec disagree | P01 mentions actionResponse/surfaceProperties; P03 omits them and describes different function messages | Preserve both; exact implementation must use pinned schemas and renderer |
| Surface state is distinct from durable backend state | P02 and P07 describe local input binding and action-triggered synchronization | Protocol behavior; durable correction/memory design is our recommendation |
| A2UI and AG-UI operate at different layers | P06, P11, P12 | Explicit first-party distinction; adapter parity untested |
| MCP Apps links tools with HTML resources and mediates interaction | P13, P14 | Specification/lifecycle evidence; target-host interoperability untested |
| A2UI and MCP Apps can be nested both ways | P09, P10 | Documented patterns/samples; no universal host-support inference |
| Tambo Cloud is closing Oct 31; new signups closed | L01, F12, F20 | Dated announcement/repository banner; supersedes stale Cloud onboarding copy |
| C1 documentation is archived; new projects directed to OpenUI | L02, F15, F16 | Documentation lifecycle; does not establish C1 endpoint shutdown |
| AI SDK RSC is experimental and UI is recommended for production | F02 | Official migration guidance; no reproduction of listed issues |
| json-render/OpenUI can provide constrained composition | F04–F09, F18, F25–F27 | Published APIs/source; no measured catalog fitness or framework ranking |
| Generated interfaces can outperform chat on some tasks | R02–R06 | Author-reported, task-specific results with different metrics; no universal ranking |
| Macaron-A2UI benchmark targets v0.8 | R04-full §3 | Cannot establish v0.9.1/candidate conformance |
| Typed domain components are the best starting hypothesis here | Local challenge requirements + layer analysis | Recommendation; test against A2UI or another composition candidate before adoption |

## Rejected assumptions and retry conditions

- **Rejected:** A2UI, AG-UI and MCP Apps are interchangeable competitors. Retry a simpler comparison only if the question is restricted to a single layer and target deployment.
- **Rejected:** A protocol candidate means its renderers are ready. Retry when released package/source and conformance tests establish support.
- **Rejected:** Historical Tambo/C1 comparison articles describe the present service offering. Retry only against refreshed lifecycle announcements and current documentation.
- **Rejected:** A valid JSON tree or attractive screenshot establishes business correctness. Require interaction, grounding and backend-action evidence.
- **Not established:** generative UI is faster or cheaper here. Retry with pinned model, prompt, catalog and identical backend results; collect latency, usage and error measurements.
- **Not established:** a cross-platform component is semantically portable. Retry with the same catalog rendered and exercised on each actual target.
- **Not established:** research preference scores imply operational accuracy. Retry with the project's source-grounded questions, corrections, user isolation and unseen data.

## Source handling

The manifest retains response URLs, access times, HTTP result, byte count and SHA-256. A successful HTTP response may still contain navigation or a landing page, so source interpretation comes from the recorded review and citations, not the status code alone. Snapshot failures remain visible; web-tool access and local retrieval are separate observations. No credentials or user data were used for source access.
