"""
Password hashing + session tokens. Uses stdlib pbkdf2 instead of bcrypt so the
prototype has no compiled-dependency install friction — swap for bcrypt/argon2
before this ever handles real credentials in production.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets

_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return hmac.compare_digest(digest.hex(), digest_hex)


def generate_token() -> str:
    return secrets.token_urlsafe(32)
