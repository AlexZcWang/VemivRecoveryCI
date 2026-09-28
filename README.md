# Encrypted CI Archive Runner

This public repository contains no readable application source.

It holds an AES-256-GCM authenticated encrypted archive and a
`workflow_dispatch`-only GitHub Actions workflow. The workflow decrypts the
archive only inside the ephemeral runner and publishes the resulting signed
artifact.

All credentials are stored as secrets in a protected GitHub Actions
environment restricted to the `main` branch. They are never committed.
