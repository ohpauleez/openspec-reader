---
title: Diagram and EARS presentation
---

# Diagram and EARS presentation

## Requirement: Format EARS clauses [READ-EARS]

WHEN input arrives, THE spec-check tool SHALL render the document.

WHILE the reader is open, WHERE diagrams are present, IF parsing fails, THEN THE reader SHALL show the source AND report the error BUT preserve the rest of the document.

GIVEN an open document WHEN a section is selected THEN THE **Markdown reader** SHALL reveal it.

THE `spec-check` tool SHALL preserve code and identifiers.

`WHEN quoted, THE code SHALL stay code.`

```text
WHEN quoted, THE fenced code SHALL stay code.
```

## Flowchart

```mermaid
flowchart LR
  File[Local Markdown] -->|parse source| Parse[OpenSpec structure]
  Parse --> Reader[Foldable reader]
```

## State diagram

```mermaid
stateDiagram-v2
  [*] --> Waiting
  state "Awaiting input" as Waiting
  Waiting --> Ready: input accepted
  Ready --> [*]
```

## Class diagram

```mermaid
classDiagram
  class MarkdownReader {
    +String source
    +render() void
  }
  class LocalDocument
  MarkdownReader --> LocalDocument : reads
```

## Sequence diagram

```mermaid
sequenceDiagram
  participant Reader as Markdown reader
  participant Parser as Spec parser
  Reader->>Parser: Parse local document
  Parser-->>Reader: Structured sections
```

## Rich labels

```mermaid
flowchart TD
  A["`**Markdown** document`"] -->|"`read **locally**`"| B["First line<br/>Second line"]
```
