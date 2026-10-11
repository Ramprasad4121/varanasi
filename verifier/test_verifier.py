"""Unit tests for the pure parts of the verifier (no chain needed): python3 -m unittest verifier/test_verifier.py"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import varanasi_verifier as v  # noqa: E402

DEMO = Path(__file__).resolve().parent.parent / "demo" / "pocs"


class PolicyTest(unittest.TestCase):
    def test_real_and_bogus_pocs_pass_policy(self):
        for f in ("ReentrancyExploit.sol", "BogusExploit.sol"):
            self.assertEqual(v.policy_check((DEMO / f).read_text()), [], f)

    def test_cheatcode_poc_rejected(self):
        self.assertIn("cheatcode address derivation", v.policy_check((DEMO / "CheatcodeExploit.sol").read_text()))

    def test_banned_patterns(self):
        base = "contract Exploit { function run() external { %s } }"
        for body, why in [
            ("vm.deal(address(1), 0);", "cheatcode"),
            ("assembly { sstore(0, 1) }", "assembly"),
            ("selfdestruct(payable(msg.sender));", "selfdestruct"),
            ("address(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D).call('');", "literal"),
        ]:
            self.assertTrue(v.policy_check(base % body), why)
        self.assertTrue(v.policy_check('import "forge-std/Test.sol";\n' + base % ""))

    def test_missing_exploit_contract(self):
        self.assertTrue(v.policy_check("contract Foo {}"))


class ParseTest(unittest.TestCase):
    def test_description(self):
        d = "varanasi-bounty:v1:vault=0x" + "ab" * 20 + ":bounty=1:tier=0:forkBlock=22:invariant=0x" + "cd" * 32
        t = v.parse_description(d)
        self.assertEqual((t["bountyId"], t["tierId"], t["forkBlock"]), (1, 0, 22))
        with self.assertRaises(v.VerifierError):
            v.parse_description("PoC for invariant X")

    def test_job_tuple_string(self):
        a = "0x" + "11" * 20
        raw = [f'({a}, {a}, {a}, {a}, 5000000000 [5e9], 1760000000 [1.76e9], 2, 0x{"ee" * 32}, "varanasi-bounty:v1:x")']
        j = v.parse_job(raw)
        self.assertEqual(j["status"], 2)
        self.assertEqual(j["deliverable"], "0x" + "ee" * 32)
        self.assertEqual(j["description"], "varanasi-bounty:v1:x")


if __name__ == "__main__":
    unittest.main()
