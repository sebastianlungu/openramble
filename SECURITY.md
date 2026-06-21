# Security

Open-Ramble takes the security of its code, its releases, and its users seriously. This document explains how to report a vulnerability privately, which versions are supported, and what to expect after you report.

## Supported versions

Only the latest release on `main` receives security fixes. The table below shows the current support window.

| Version | Supported |
| --- | --- |
| Latest release on `main` | Yes |
| Older releases | No |

If you are running an older release, please upgrade to the latest before reporting a vulnerability that has already been fixed upstream.

## Reporting a vulnerability

Please **do not** open a public GitHub issue, pull request, or discussion for security vulnerabilities.

Report privately through one of these channels:

- **GitHub Security Advisories**: open a [private security advisory](https://github.com/open-ramble/open-ramble/security/advisories/new) on the repository. This routes the report to the maintainers without disclosing it publicly.
- **Email**: if you cannot use GitHub, contact the maintainer at the address listed on the maintainer's GitHub profile.

Please include:

- A clear description of the vulnerability and its impact.
- Steps to reproduce, including a transcript, screenshot, or minimal transcript.
- The affected version, commit SHA, or commit range.
- Your environment (Bun version, macOS version, OpenCode server version).
- Whether you intend to disclose publicly and on what timeline.

## Response timeline

We aim to:

- **Acknowledge** new reports within **3 business days**.
- **Triage and assess** the report within **7 days**, with a status update to the reporter.
- **Develop and release a fix** on a timeline agreed with the reporter, defaulting to a coordinated disclosure window of **90 days** for non-critical issues and **30 days** for critical issues.

Timelines are best-effort. If a fix takes longer than expected, we will communicate the delay and the new ETA. Critical issues that are being actively exploited in the wild are treated as priority and may be fixed and disclosed faster than the default window.

## Coordinated disclosure

We follow coordinated disclosure. Please give us a reasonable window to fix the issue before publishing details. We are happy to credit the reporter in the advisory and release notes unless the reporter prefers to remain anonymous.

## Out of scope

The following are **not** security vulnerabilities and should be reported as regular bugs:

- Bugs that require the user to run untrusted code locally.
- Social engineering of the maintainer.
- Denial-of-service attacks against the maintainer's own development machine.
- Issues in upstream dependencies that have not been demonstrated to affect Open-Ramble.

## Recognition

We maintain a [Security Advisories](https://github.com/open-ramble/open-ramble/security/advisories) page for past reports. Reporters are credited there unless they prefer otherwise.
