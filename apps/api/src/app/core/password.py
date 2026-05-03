"""Shared Argon2 password hasher.

`PasswordHasher` carries hashing parameters; sharing one instance avoids
re-allocating those parameters per service constructor.
"""

from __future__ import annotations

from argon2 import PasswordHasher

password_hasher = PasswordHasher()
