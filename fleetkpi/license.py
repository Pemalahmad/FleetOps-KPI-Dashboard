"""Licence keys for the FleetOps app, issued by the publisher and verified offline in the browser.

    fleetkpi license keygen                      # once: creates the signing key outside the repository
    fleetkpi license issue --customer ACME --plan starter --expires 2027-12-31 [--max-vehicles 100]

A key is base64url(JSON payload) + "." + base64url(Ed25519 signature of the payload part). The app holds only the
public key, so a key cannot be forged without the private key, and nothing needs to be online to check it.
The private key lives in ~/.config/fleetops/ (mode 600) and must never be committed.
"""
from __future__ import annotations

import base64
import json
import os
from datetime import date
from pathlib import Path

KEY_DIR = Path(os.environ.get("FLEETOPS_KEY_DIR", Path.home() / ".config" / "fleetops"))
PRIVATE = KEY_DIR / "license_ed25519.pem"
PLANS = ("free", "starter", "pro")


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _crypto():
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    except ImportError as exc:  # pragma: no cover - depends on the install
        raise SystemExit("Licence signing needs the optional extra: pip install 'fleetkpi[license]'") from exc
    return serialization, Ed25519PrivateKey


def keygen(path: Path = PRIVATE) -> str:
    """Create the signing key (refuses to overwrite) and return the public key for web/src/lib/license.ts."""
    serialization, Ed25519PrivateKey = _crypto()
    if path.exists():
        raise SystemExit(f"{path} already exists; keys issued with it would stop verifying if it were replaced.")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = Ed25519PrivateKey.generate()
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(pem)
    return public_key(path)


def _load(path: Path):
    serialization, _ = _crypto()
    return serialization.load_pem_private_key(path.read_bytes(), password=None)


def public_key(path: Path = PRIVATE) -> str:
    serialization, _ = _crypto()
    raw = _load(path).public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return _b64(raw)


def issue(customer: str, plan: str, expires: str, max_vehicles: int | None = None, path: Path = PRIVATE) -> str:
    if plan not in PLANS:
        raise ValueError(f"plan must be one of {', '.join(PLANS)}")
    date.fromisoformat(expires)
    payload = {"sub": customer, "plan": plan, "exp": expires, "iat": date.today().isoformat()}
    if max_vehicles is not None:
        payload["max_vehicles"] = max_vehicles
    p = _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{p}.{_b64(_load(path).sign(p.encode()))}"
