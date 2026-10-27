#!/usr/bin/env python3
"""
test_squarecat.py — offline tests for the square skill. No network, no token.

Run: python3 test_squarecat.py
Every Square API call is stubbed, so this exercises matching, diffing, drift detection
and the apply path without touching a real catalogue.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import squarecat as sc


def item(name, price_cents, vid="V1", iid="I1", variations=None, product_type="APPOINTMENTS_SERVICE"):
    vs = variations or [{"id": vid, "version": 1,
                         "item_variation_data": {"name": "Regular", "item_id": iid,
                                                 "price_money": {"amount": price_cents, "currency": "AUD"}}}]
    return {"id": iid, "type": "ITEM",
            "item_data": {"name": name, "product_type": product_type, "variations": vs}}


SITE_HTML = """<!doctype html><html><body>
<div class="menu">
 <div class="row"><span class="name">Classic Full Set</span><span class="desc">One extension per lash.</span><span class="price">$120</span></div>
 <div class="row"><span class="name">Lash Lift &amp; Tint</span><span class="desc">Lifted and darkened.</span><span class="price">$90</span></div>
 <div class="row"><span class="name">Brow Lamination, Tint &amp; Shape</span><span class="desc">The full reset.</span><span class="price">$95</span></div>
</div></body></html>"""


class TestSite(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        with open(os.path.join(self.d, "services.html"), "w") as f:
            f.write(SITE_HTML)

    def test_parses_name_and_price_not_description(self):
        p = sc.site_prices(self.d, csv_extras=False)
        self.assertEqual(len(p), 3)
        self.assertIn(sc.norm("Classic Full Set"), p)
        self.assertEqual(p[sc.norm("Classic Full Set")]["price_cents"], 12000)
        # a description must never be mistaken for a service name
        self.assertFalse(any("extension per lash" in v["name"] for v in p.values()))

    def test_entities_and_ampersands(self):
        p = sc.site_prices(self.d, csv_extras=False)
        self.assertEqual(p[sc.norm("Lash Lift & Tint")]["price_cents"], 9000)

    def test_csv_extras_flagged_and_not_overriding_site(self):
        os.makedirs(os.path.join(self.d, "marketing"), exist_ok=True)
        with open(os.path.join(self.d, "marketing", "square-services-import.csv"), "w") as f:
            f.write("service_name,description,duration,price\n"
                    "Classic Full Set,x,120,999\n"
                    "Two Week Refill,x,60,60\n")
        p = sc.site_prices(self.d, csv_extras=True)
        self.assertEqual(p[sc.norm("Classic Full Set")]["price_cents"], 12000)   # site wins
        self.assertEqual(p[sc.norm("Classic Full Set")]["source"], "site")
        self.assertEqual(p[sc.norm("Two Week Refill")]["source"], "csv")

    def test_markup_change_raises_instead_of_guessing(self):
        with open(os.path.join(self.d, "services.html"), "w") as f:
            f.write("<html><body><p>Classic Full Set $120</p></body></html>")
        with self.assertRaises(sc.SquareError):
            sc.site_prices(self.d, csv_extras=False)


class TestPlan(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        with open(os.path.join(self.d, "services.html"), "w") as f:
            f.write(SITE_HTML)
        self.state = tempfile.mkdtemp()
        sc.PLAN_DIR = os.path.join(self.state, "plans")

    def _plan(self, objects):
        with mock.patch.object(sc, "catalog_list", return_value=objects):
            return sc.build_plan(self.d, include_csv=False)

    def test_detects_change_and_in_sync(self):
        plan = self._plan([
            item("Classic Full Set", 11000, vid="VA", iid="IA"),          # stale -> change
            item("Lash Lift & Tint", 9000, vid="VB", iid="IB"),           # already right
        ])
        self.assertEqual(len(plan["changes"]), 1)
        c = plan["changes"][0]
        self.assertEqual((c["old_cents"], c["new_cents"]), (11000, 12000))
        self.assertEqual(len(plan["in_sync"]), 1)

    def test_name_matching_is_punctuation_insensitive(self):
        plan = self._plan([item("Brow Lamination, Tint and Shape", 9000, vid="VC", iid="IC")])
        self.assertEqual(len(plan["changes"]), 1, "‘, Tint &’ vs ‘, Tint and’ should match")
        self.assertEqual(plan["changes"][0]["new_cents"], 9500)

    def test_reports_both_sides_of_the_gap(self):
        plan = self._plan([item("Gift Voucher", 5000, vid="VZ", iid="IZ")])
        self.assertIn("Gift Voucher", " ".join(plan["only_in_square"]))
        self.assertIn("Classic Full Set", plan["only_on_site"])
        self.assertEqual(plan["changes"], [])

    def test_ignores_non_service_items(self):
        """A retail product sharing a service's name must never be repriced."""
        plan = self._plan([
            item("Lash Lift & Tint", 9000, vid="VS", iid="IS"),                       # real service
            item("Classic Full Set", 11000, vid="VR", iid="IR", product_type="REGULAR"),  # retail item
        ])
        self.assertEqual(plan["changes"], [])
        self.assertIn("Classic Full Set", plan["only_on_site"])
        self.assertNotIn("VR", json.dumps(plan))

    def test_multi_variation_item_is_flagged_not_guessed(self):
        vs = [
            {"id": "V1", "version": 1, "item_variation_data":
                {"name": "Classic Full Set", "item_id": "IM", "price_money": {"amount": 11000, "currency": "AUD"}}},
            {"id": "V2", "version": 1, "item_variation_data":
                {"name": "Classic Full Set", "item_id": "IM", "price_money": {"amount": 10000, "currency": "AUD"}}},
        ]
        plan = self._plan([item("Lashes", 0, iid="IM", variations=vs)])
        # both variations normalize to the same key -> must be reported, never silently picked
        self.assertTrue(plan["ambiguous"])
        self.assertEqual(plan["changes"], [])

    def test_empty_catalogue_raises(self):
        with mock.patch.object(sc, "catalog_list", return_value=[]):
            with self.assertRaises(sc.SquareError):
                sc.build_plan(self.d, include_csv=False)


class TestApply(unittest.TestCase):
    def setUp(self):
        self.state = tempfile.mkdtemp()
        sc.PLAN_DIR = os.path.join(self.state, "plans")
        sc.WRITE_LOG = os.path.join(self.state, "writes.log")
        self.plan = {
            "id": "plan-test", "created": "now", "site_dir": "/tmp",
            "changes": [{"variation_id": "V1", "item_id": "I1", "item_name": "Classic Full Set",
                         "variation_name": "Regular", "site_name": "Classic Full Set", "source": "site",
                         "old_cents": 11000, "new_cents": 12000, "currency": "AUD"}],
            "in_sync": [], "ambiguous": [], "only_on_site": [], "only_in_square": [], "applied": None,
        }

    def test_without_confirm_sends_nothing(self):
        with mock.patch.object(sc, "api") as api:
            rc = sc.apply_plan(dict(self.plan), confirm=False)
        self.assertEqual(rc, 2)
        api.assert_not_called()

    def test_confirm_upserts_new_price(self):
        calls = []

        def fake_api(path, body=None, method="GET", **kw):
            calls.append((path, body, method))
            if method == "GET":
                return {"object": {"id": "V1", "type": "ITEM_VARIATION", "version": 7,
                                   "item_variation_data": {"name": "Regular", "item_id": "I1",
                                                           "price_money": {"amount": 11000, "currency": "AUD"}}}}
            return {"catalog_object": {"id": "V1", "version": 8}}

        with mock.patch.object(sc, "api", side_effect=fake_api):
            rc = sc.apply_plan(dict(self.plan), confirm=True)
        self.assertEqual(rc, 0)
        post = [c for c in calls if c[2] == "POST"][0]
        obj = post[1]["object"]
        self.assertEqual(obj["item_variation_data"]["price_money"]["amount"], 12000)
        self.assertEqual(obj["version"], 7, "must upsert with the freshly fetched version")
        self.assertIn("idempotency_key", post[1])
        self.assertTrue(os.path.exists(sc.WRITE_LOG))

    def test_drift_is_skipped_not_clobbered(self):
        """Someone edited the price in the Square dashboard after we planned."""
        def fake_api(path, body=None, method="GET", **kw):
            if method == "GET":
                return {"object": {"id": "V1", "version": 9,
                                   "item_variation_data": {"name": "Regular", "item_id": "I1",
                                                           "price_money": {"amount": 13000, "currency": "AUD"}}}}
            raise AssertionError("must not write when the live price drifted")

        with mock.patch.object(sc, "api", side_effect=fake_api):
            rc = sc.apply_plan(dict(self.plan), confirm=True)
        self.assertEqual(rc, 1)

    def test_replay_of_applied_plan_is_refused(self):
        p = dict(self.plan)
        p["applied"] = "2026-09-18T10:00:00"
        with mock.patch.object(sc, "api") as api:
            with self.assertRaises(sc.SquareError):
                sc.apply_plan(p, confirm=True)
        api.assert_not_called()


class TestMoney(unittest.TestCase):
    def test_formatting(self):
        self.assertEqual(sc.money(12000, "AUD"), "$120.00 AUD")
        self.assertEqual(sc.money(None), "(variable)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
