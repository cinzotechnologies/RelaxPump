// OTA signing PUBLIC key (ECDSA P-256, PEM). Written by `node firmware/scripts/keygen.mjs`, which
// keeps the private key OUTSIDE the repo (RP_SIGN_KEY). The public half is safe to commit.
// Empty = no key yet: the board refuses every OTA update (err "no key").
#pragma once
static const char OTA_PUBKEY_PEM[] =
    "-----BEGIN PUBLIC KEY-----\n"
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEVxSW9O6rS09wrc5H0IpmDXbQHbs8\n"
    "8ZRpD68T+G8J3MXJseeUuqan3TxradU6Ps7Zz/Oi82/MEKv593SSD0c7nQ==\n"
    "-----END PUBLIC KEY-----\n";
