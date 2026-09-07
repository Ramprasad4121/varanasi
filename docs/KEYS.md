# Key management — varanasi

Author: Ramprasad

Live secrets live ONLY in gitignored `.env` files (`600`, never committed):
`.env`, `service/.env`, `agent/.env`. See `service/.env.example`,
`agent/.env.example`, `frontend/.env.example` for shapes.

## Encrypted backups (committed)

Each `.env` has an AES-256-CBC (PBKDF2) encrypted twin (`.env.enc`),
safe to store and commit. Encryption key lives OUTSIDE the repo at
`~/.config/varanasi/.enc-key` (`600`). Lose that key file = lose the backups.

Re-encrypt after any secret change:

```bash
for f in .env service/.env agent/.env; do
  openssl enc -aes-256-cbc -pbkdf2 -pass file:$HOME/.config/varanasi/.enc-key \
    -in "$f" -out "$f.enc"
done
```

Restore on a new machine (key file required):

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$HOME/.config/varanasi/.enc-key \
  -in service/.env.enc -out service/.env && chmod 600 service/.env
```

Rotate: generate a new key file, re-encrypt all three, delete old backups.
Out-of-scope (by design): Ledger Key Ring migration for agent-held secrets —
tracked as a Ledger-prize workstream, see `docs/ARCHITECTURE.md`.
