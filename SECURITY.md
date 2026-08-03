# Security policy

## Supported versions

Kanon supports only the latest published stable release line. The `1.0.x`
line becomes supported when its first release is published. Prereleases and
unpublished candidates receive no formal security-support commitment.

| Version | Security fixes |
| --- | --- |
| Latest published `1.0.x` | Yes |
| `0.4.x` prereleases | No |
| Unpublished candidates and older versions | No |

When a supported fix cannot be made without a breaking change, the maintainer
may issue a documented migration or deprecation instead of silently changing
the contract.

## Report a vulnerability privately

Use GitHub's private vulnerability-reporting form for this repository:

<https://github.com/MecGlandorff/Kanon/security/advisories/new>

Include the affected version, operating system and Node.js version, a minimal
reproduction, impact, and any suggested mitigation. Do not include secrets,
private repositories, or unrelated personal data. If private reporting is not
enabled or the form is unavailable, open a public issue containing no
vulnerability details and request a private contact channel. The availability
and configuration of GitHub private vulnerability reporting remain Unknown
until verified remotely.

## Response expectations

These are good-faith targets, not service-level guarantees:

- acknowledge a complete report within three business days;
- provide an initial severity and reproducibility assessment within seven
  business days;
- coordinate remediation and disclosure timing with the reporter; and
- credit the reporter when requested and legally permissible.

Complex, disputed, or dependency/platform issues may require more time. The
maintainer will communicate material delays through the private advisory.

## Disclosure and remediation

The preferred process is coordinated disclosure. A validated issue is fixed on
a private branch when practical, tested through the normal candidate gates,
assigned a CVE or GitHub advisory when appropriate, and disclosed with affected
versions, mitigations, and fixed versions. Release artifacts and tags are not
rewritten. A compromised or defective version is deprecated and followed by a
new version under the release and rollback procedure in
[`RELEASING.md`](RELEASING.md).

## Scope and limitations

Security-sensitive areas include repository containment, link/reparse-point
handling, subprocess isolation, untrusted-output rendering, bounded persistence,
plugin-data and handoff validation, wrappers, package integrity, and release
automation.

Kanon is advisory and non-enforcing. It does not sandbox an agent or repository,
mediate host permissions, prove that context was read, or authorize command
execution. Receipts and handoffs are continuity evidence, not security tokens or
authenticity signatures. Platform behavior not exercised by the applicable
release gates remains Unknown.
