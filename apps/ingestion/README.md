# Ingestion CLI boundary

This directory is reserved for the independent backend ingestion application selected
in the [architecture decision](../../docs/decisions/001-independent-ingestion-cli.md).
The package and production CLI are not implemented yet.

The current executable research prototype, test runner, results and cleanup evidence
are local under `.context/ingestion-cli/`. The prototype evaluates directory parsing,
MongoDB storage and safe publication using the sample and temporary datasets; it is
not a runtime dependency of the API or frontend.
