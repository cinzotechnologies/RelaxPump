// OTA signing PUBLIC key (ECDSA P-256, PEM). Written by `node firmware/scripts/keygen.mjs`, which
// keeps the private key OUTSIDE the repo (RP_SIGN_KEY). The public half is safe to commit.
// Empty = no key yet: the board refuses every OTA update (err "no key").
#pragma once
static const char OTA_PUBKEY_PEM[] = "";
