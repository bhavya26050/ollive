Contributing to Ollive

Quick guide for local dev and cleaning up repo artifacts.

Local setup

1. Copy `.env.example` to `.env.local` and add provider keys (do NOT commit this file).
2. Install and initialize DB:

```bash
cd ollive
npm ci
npm run db:push
```

Cleaning up committed local database files

If the repository accidentally committed local database files or old database artifacts, remove them from the repository and your working tree with these commands:

```bash
# remove from git and working tree
git rm prisma/dev.db prisma/data/dev.db || true
# commit the removal
git commit -m "chore: remove committed local db files"
# push
git push
```

Note: The project now ignores local database artifacts and old file-based DB leftovers.

Secrets and keys

- Rotate any exposed provider keys immediately (Google Cloud Console, OpenAI dashboard, Anthropic console).
- Store API keys in `.env.local` or a secrets manager. Do not commit `.env` files.

Running tests and CI

This project includes a small smoke test (`scripts/smoke-test.js`) that exercises the API routes. The project also contains a GitHub Actions workflow that runs the smoke test on push/PRs.
