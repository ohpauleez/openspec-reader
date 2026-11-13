---
description: Analyze active OpenSpec change artifacts with spec-check
agent: build
subtask: true
---

Run the bundled `spec-check` executable against all artifacts for all active OpenSpec changes and their corresponding canonical specs.

Follow this workflow exactly:

1. Work from the project root. Do not accept or use `$ARGUMENTS` to change the analysis scope.

2. Discover every Markdown file matching `openspec/changes/**/*.md`.
   - Exclude every path under `openspec/changes/archive/`.
   - Exclude all `task.md` files
   - Treat all remaining matching files as active change artifacts.
   - Sort the paths lexicographically.

3. Build the input list.
   - Start with all sorted active change artifact paths.
   - For each active path matching `openspec/changes/<change>/specs/<capability>/spec.md`, derive `openspec/specs/<capability>/spec.md`.
   - Append the derived canonical path only when it is an existing regular file.
   - A capability is the complete path segment between `specs/` and `/spec.md`; do not derive a canonical path from `proposal.md`, `design.md`, `tasks.md`, or unrelated Markdown files.
   - Deduplicate canonical paths and sort them lexicographically before appending them.
   - Do not include any archived path in either part of the list.

4. If the active change artifact list is empty, do not invoke `spec-check`. Respond: `No active OpenSpec change artifacts were found.`

5. Execute this command once:

   ```text
   .opencode/opt/spec-check <each-input-as-a-separate-quoted-argument> --output spec-check-output
   ```

   Requirements:
   - Verify `.opencode/opt/spec-check` exists and is executable before running it. If not, report that error and stop.
   - Pass every list item as a separate shell argument. Quote each path safely, including paths containing spaces or shell metacharacters.
   - Do not pass a directory in place of the collected files.
   - Do not pass `--allow-archive`.
   - Capture the process exit status and stderr. Its stdout is progress data, not the report.
   - `spec-check` can take 15 minutes or longer to run, set all expected timeouts high.

6. Interpret the exit status.
   - Exit `0` means analysis completed without findings.
   - Exit `1` means analysis completed with findings. It is not an execution error.
   - Any other exit status, failure to start, or signal termination is an execution error. Report the executable path, exit status when available, and stderr. Do not display an existing report after an execution error because it might be stale.

7. For exit `0` or `1`, require `spec-check-output/manifest.json` to exist as a regular file. If it does not, report an output-contract error and do not display any report.

8. Display the findings.
   - If `spec-check-output/report.md` exists as a regular file, read it and return its complete Markdown content.
   - Otherwise, explain that the optional final report was not produced. If `spec-check-output/report_summary.md` exists as a regular file, read it and return its complete Markdown content as the fallback.
   - If neither report is available, report an output-contract error.

Do not edit source files, OpenSpec artifacts, or generated report files as part of this command.
