# Catalog signing keys

`development.pem` is the **development key**: a throwaway ed25519 key that signs the seed snapshot until publishing begins. Only development builds trust it (`HIGHSEA_CATALOG_DEV_KEY`, on unless `NODE_ENV=production`). It's in the repo on purpose: it protects nothing, and anyone can sign with it.

The **release key** doesn't exist yet. The owner creates it when publishing begins (checkpoint 5, owner's answer 3):

1. `bun scripts/catalog.ts keygen release-2027` prints a new key pair.
2. The private key goes in a GitHub Actions secret and offline storage. It never enters the repo.
3. The public key and its id go in `packages/catalog/src/keys.ts` as `RELEASE_KEYS`.

There's room for one rotation: a second release key can be listed beside the first, so manifests signed with either verify while the switch happens.
