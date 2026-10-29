import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("health", Path(__file__).parents[1] / "scripts/claude_auth_health.py")
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)
NOW = 1793217600


class AuthHealthTests(unittest.TestCase):
    def check(self, delta, **changes):
        oauth = {"accessToken": "fixture-access", "refreshToken": "fixture-refresh",
                 "refreshTokenExpiresAt": (NOW + delta) * 1000}
        oauth.update(changes)
        return health.classify(json.dumps({"claudeAiOauth": oauth}), NOW)

    def test_healthy(self):
        self.assertTrue(self.check(49 * 3600)["credential_ready"])

    def test_48_hour_boundary(self):
        self.assertEqual(self.check(48 * 3600)["state"], "OK")
        self.assertEqual(self.check(48 * 3600 - 1)["state"], "EXPIRING")

    def test_expiry_exact_second(self):
        self.assertEqual(self.check(1)["state"], "EXPIRING")
        self.assertEqual(self.check(0)["state"], "EXPIRED")
        self.assertFalse(self.check(-1)["credential_ready"])

    def test_real_incident_cleared_tokens_and_old_expiry(self):
        self.assertEqual(self.check(-3 * 3600, accessToken="", refreshToken="")["state"], "EXPIRED")

    def test_future_expiry_without_tokens_is_not_healthy(self):
        self.assertEqual(self.check(72 * 3600, accessToken="", refreshToken="")["state"], "MISSING")

    def test_no_refresh(self):
        self.assertEqual(self.check(72 * 3600, refreshToken=None)["state"], "NO_REFRESH")

    def test_refresh_can_recover_missing_access_token(self):
        self.assertTrue(self.check(72 * 3600, accessToken="")["credential_ready"])

    def test_unknown_expiry(self):
        self.assertEqual(self.check(0, refreshTokenExpiresAt=None)["state"], "UNKNOWN")

    def test_seconds_timestamp(self):
        self.assertEqual(self.check(0, refreshTokenExpiresAt=NOW + 72 * 3600)["state"], "OK")

    def test_malformed_payload(self):
        for payload in ["garbage", "[]", "null", "{}", '{"claudeAiOauth": []}']:
            self.assertEqual(health.classify(payload, NOW)["state"], "UNKNOWN")

    def test_invalid_expiry(self):
        for expiry in ["tomorrow", True, float("nan"), float("inf"), 0]:
            self.assertEqual(self.check(0, refreshTokenExpiresAt=expiry)["state"], "UNKNOWN")

    def test_no_secrets_in_output(self):
        output = json.dumps(self.check(72 * 3600))
        self.assertNotIn("fixture-access", output)
        self.assertNotIn("fixture-refresh", output)

    @patch.object(health.subprocess, "run", side_effect=subprocess.TimeoutExpired("security", 10))
    def test_keychain_timeout(self, mocked):
        self.assertEqual(health.probe()["state"], "UNKNOWN")

    @patch.object(health.subprocess, "run", return_value=subprocess.CompletedProcess([], 44, "", "denied"))
    def test_denied_keychain(self, mocked):
        self.assertEqual(health.probe()["state"], "UNKNOWN")

    @patch.object(health.subprocess, "run", side_effect=FileNotFoundError)
    def test_missing_security_command(self, mocked):
        self.assertEqual(health.probe()["state"], "UNKNOWN")


if __name__ == "__main__":
    unittest.main()
