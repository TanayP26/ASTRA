# ASTRA Engineering Instructions

## Project

ASTRA is a research-driven spacecraft health intelligence platform being developed for SIH 2026.

The research goal is to determine whether operational context and operator-validated event memory can reduce false alarms caused by rare nominal spacecraft events without materially reducing genuine-anomaly recall.

ASTRA must be scientifically defensible and reproducible.

## Current Phase

SIH 2026 Nationals Hardening.

The research core is established. The current goal is to harden the demonstrator without weakening research integrity.

Current priorities:

1. Preserve reproducible ESA Mission-1 research evaluation.
2. Keep public orbital data, public RF observations, historical research data, and authorized mission telemetry clearly separated.
3. Make the Adaptive Event Memory workflow easy for judges to understand.
4. Improve the FrontEnd 2.0 UI/UX without fabricating data.
5. Keep the nationals demo deterministic and resettable.
6. Maintain truthful source provenance and operator-in-the-loop language.
7. Run backend tests, Ruff, and the FrontEnd 2.0 production build before merging.

## Strict Scope Rules

Do NOT:

- replace the established FrontEnd 2.0 stack without a concrete reason
- build authentication unless explicitly requested for production hardening
- create microservices
- add Docker unless specifically requested
- add Kubernetes
- add blockchain
- add an LLM
- implement collision avoidance
- implement satellite imagery analysis
- introduce unnecessary frameworks
- invent dataset fields
- invent research results
- hard-code fabricated anomaly scores
- claim model accuracy without experiments

If dataset structure is unknown, inspect it or create an adapter/interface. Never fabricate a schema.

## Engineering Principles

Prefer:

- simple implementations
- modular components
- type hints
- clear interfaces
- deterministic experiments
- testable functions
- configuration over hard-coded values
- streaming/lazy data processing when possible
- Parquet for processed telemetry
- memory-efficient processing

Avoid unnecessary abstractions.

## Python

Target Python 3.11.

Use:

- PyTorch
- scikit-learn
- NumPy
- Polars
- Pandas only where useful
- DuckDB
- PyArrow
- Pydantic
- PyYAML
- Matplotlib
- pytest
- Ruff

Do not add dependencies without a concrete reason.

## Data

Raw datasets MUST NOT be modified.

Directory policy:

data/raw        immutable source data
data/interim    intermediate transformations
data/processed  reproducible final datasets

Do not commit large datasets to Git.

All processed datasets must be reproducible from scripts.

## Research Integrity

Never fabricate:

- metrics
- anomaly labels
- dataset descriptions
- citations
- experimental results

Clearly distinguish:

- confirmed facts
- assumptions
- engineering targets
- measured results

## Models

Start with interpretable baselines before deep models.

Initial baselines:

1. statistical/dynamic threshold
2. Isolation Forest

Later:

3. forecasting model
4. ASTRA contextual classifier
5. ASTRA Adaptive Event Memory

Do not implement later models until explicitly requested.

## Testing

Every important data transformation must have unit tests.

Before completing a task:

1. run tests
2. run Ruff
3. describe changed files
4. report unresolved assumptions

## Git

Keep commits small and logically grouped.

Never commit:

- datasets
- model checkpoints
- API keys
- .env files
- generated experiment artifacts

## Coding Style

Names should be descriptive but concise.

Prefer small functions.

Avoid giant scripts.

Avoid unnecessary classes.

Public functions should have short docstrings.

Add comments only when they explain reasoning rather than obvious syntax.

## Decision Rule

If unsure between:

A. adding complexity

and

B. keeping the research pipeline simple

choose B.

If scientific assumptions are uncertain, ask rather than invent.