# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Devvami, please report it **privately** rather than opening a public issue.

### Responsible Disclosure

**Do not:**
- Open a public GitHub issue
- Disclose the vulnerability in public comments or discussions
- Publish the vulnerability before a fix is available

**Do:**
- Email the details to: security@devvami.dev (or use GitHub's security advisory form)
- Include a clear description of the vulnerability
- Provide steps to reproduce (if applicable)
- Allow time for a fix before public disclosure (at least 30 days)

### What Happens Next

1. We will acknowledge receipt of your report within 48 hours
2. We will assess the severity and impact
3. We will work on a fix and release a patched version
4. We will credit you in the release notes (unless you prefer anonymity)

## Security Best Practices for Users

- **Keep Devvami updated** — always use the latest version
- **Rotate credentials** — if you accidentally expose tokens/keys, rotate them immediately
- **Use environment variables** — never hardcode secrets in config files
- **Enable 2FA** — on GitHub and NPM accounts used with Devvami
- **Review permissions** — only grant necessary scopes for tokens

## Supported Versions

Security updates are provided for:
- **Latest release** — always receives security fixes
- **Previous minor versions** — security fixes only (for 6 months)
- **Earlier versions** — no security updates (upgrade recommended)

## Contact

For questions about security, reach out to the maintainers via GitHub Discussions or Issues.
