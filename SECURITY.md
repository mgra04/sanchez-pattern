# Security policy

## Supported version

Security fixes are applied to the latest version on the default branch. The project does not currently maintain older release branches.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use **Report a vulnerability** in the repository’s Security tab to submit a private report. Include reproduction steps, affected files or routes, likely impact, and any suggested mitigation.

Do not include real secrets or sensitive third-party data in a report. Reports are reviewed as maintainer availability allows, and timelines for a fix depend on severity and complexity.

## Scope

Useful reports include unsafe SVG handling, script injection, persistence leaks, export paths that expose unintended data, and vulnerable production dependencies. The app is local-first and has no application backend, user accounts, or cloud synchronization.
