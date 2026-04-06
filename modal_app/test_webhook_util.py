import hashlib
import hmac

from webhook_util import sign_body


def test_sign_body_hmac():
    secret = "testsecret"
    body = b'{"a":1}'
    sig = sign_body(secret, body)
    assert sig.startswith("sha256=")
    exp = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    assert sig == f"sha256={exp}"
