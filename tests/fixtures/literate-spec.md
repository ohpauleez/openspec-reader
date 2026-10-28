---
title: Literate Alloy specification
---

# Literate Alloy specification

This entire document is one Alloy model. Vocabulary appears before the commands.

```json
{ "description": "This block is not Alloy and must not be compiled." }
```

## Purpose

```alloy
module literate

sig Node {}
one sig Clock { var active: set Node }

fact behavior {
  no Clock.active
  always Clock.active' = Node - Clock.active
}
```

## Requirements

### Requirement: Alternate active membership [LIT-ALTERNATE]

WHEN the clock advances, THE system SHALL alternate the active nodes.

```alloy
run sample { some Node } for exactly 1 Node, 4 steps

assert Empty { always no Clock.active }
check Empty for exactly 1 Node, 4 steps
```

```typescript
const proseExample = "JavaScript is not part of this Alloy model";
```

The parser preserves these Markdown source lines in command and error locations.
