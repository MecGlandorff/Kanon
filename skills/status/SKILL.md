---
name: status
description: "Report embedded version, exact-version deprecation, notice mode, enforcement false, hook observability, receipt availability, and bounded diagnostics."
---

# Kanon Status

Run `scripts/kanon-status` from the selected repository. A bounded receipt may
be supplied through `--receipt-stdin`; on Windows, use the matching `.ps1`
wrapper.

Status reports advisory notice mode and `enforcement: false` for both supported
hosts. Unsupported or unobservable host and hook state remains Unknown. Status
does not execute or modify repository-controlled code, write receipts, upgrade
Kanon, or imply that repository context was read or understood. During this
explicit invocation it may inspect a bounded receipt from validated plugin
data; task, evidence, session, compaction, and lifecycle freshness remains
Unknown unless directly observed by the applicable skill.

Every invocation consults the shared exact-installed-version deprecation
checker; an unavailable registry or host observation remains Unknown.
