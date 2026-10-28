"""Read existing Werkzeug scrypt hashes on the legacy Flask/Werkzeug stack.

This does not rewrite hashes or change password creation. Remove this adapter
when the application stack is upgraded to native Werkzeug scrypt support.
"""
import hashlib
import hmac
import re

from werkzeug.security import check_password_hash as werkzeug_check_password_hash


def check_password_hash(encoded: str, password: str) -> bool:
    """Verify supported hashes, rejecting malformed/unsupported values safely."""
    if not isinstance(encoded, str) or not isinstance(password, str):
        return False
    try:
        method, salt, expected = encoded.split('$', 2)
        if method.startswith('scrypt'):
            # Only the deployed Werkzeug default is supported. Do not execute
            # arbitrary memory/CPU parameters from a malformed stored value.
            if method != 'scrypt:32768:8:1' or not salt:
                return False
            if not re.fullmatch(r'[0-9a-f]{128}', expected):
                return False
            actual = hashlib.scrypt(
                password.encode('utf-8'), salt=salt.encode('utf-8'),
                n=32768, r=8, p=1, dklen=64, maxmem=132 * 32768 * 8,
            ).hex()
            return hmac.compare_digest(actual, expected)
        return werkzeug_check_password_hash(encoded, password)
    except (ValueError, TypeError, OverflowError):
        # Invalid stored formats and missing form fields must never log in or
        # turn a rejected credential into an HTTP 500 response.
        return False
