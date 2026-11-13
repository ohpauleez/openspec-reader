---
description: Analyze and align the code and tests according to the steering docs and specification
agent: plan
subtask: true
---

This project follows lightweight formal methods defined within @steering/lfm.md .
The code MUST strongly align with the language-specific style guide.
TypeScript adheres to all rules in @steering/typescript_style.md and Java adheres to all rules in @steering/java_style.md.
Review the source code and tests, highlight areas where the guiding principles aren't followed, make recommendations, and suggest improvements.

Validation and verification plans are specified within the OpenSpec specification for this feature.
Ensure that at a minimum all of these tests are implemented and pass.
Suggest additional testing scenarios based on the review.

$ARGUMENTS
