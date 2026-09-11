"""
author: Varanasi E2E Test Suite
runner: Unified multi-tier test runner
spec: TEST_INFRA.md § 5, DISPATCH.md
"""
import argparse
import os
import sys
import time
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

TIER_DIRS = {
    "1": ("Tier 1: Feature Coverage", os.path.join(PROJECT_ROOT, "e2e", "tier1_features")),
    "2": ("Tier 2: Boundary & Corner Cases", os.path.join(PROJECT_ROOT, "e2e", "tier2_boundary")),
    "3": ("Tier 3: Cross-Feature Combinations", os.path.join(PROJECT_ROOT, "e2e", "tier3_combinations")),
    "4": ("Tier 4: Real-World Scenarios", os.path.join(PROJECT_ROOT, "e2e", "tier4_scenarios")),
}

def print_banner():
    banner = """
======================================================================
           VARANASI PRODUCT INTEGRATION E2E TEST RUNNER
     High-Assurance Agentic Rails · Sepolia / Hedera / Privy
======================================================================
"""
    print(banner)

def run_tier(tier_key: str, verbose: bool, failfast: bool, pattern: str = "test_*.py") -> unittest.TestResult:
    title, tier_dir = TIER_DIRS[tier_key]
    print(f"\n>>> Running [{title}] from {os.path.relpath(tier_dir, PROJECT_ROOT)}...")
    print("-" * 70)

    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=tier_dir, pattern=pattern)

    verbosity = 2 if verbose else 1
    runner = unittest.TextTestRunner(verbosity=verbosity, failfast=failfast)
    start_time = time.time()
    result = runner.run(suite)
    elapsed = time.time() - start_time

    print("-" * 70)
    print(f"[{title}] Results:")
    print(f"  Ran: {result.testsRun} tests in {elapsed:.3f}s")
    print(f"  Passed: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"  Failures: {len(result.failures)}")
    print(f"  Errors: {len(result.errors)}")

    return result

def main():
    parser = argparse.ArgumentParser(description="Varanasi E2E Test Suite Runner")
    parser.add_argument(
        "--tier",
        choices=["1", "2", "3", "4", "all"],
        default="all",
        help="Test tier to execute: 1 (features), 2 (boundary), 3 (combinations), 4 (scenarios), or all (default: all)",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose test output")
    parser.add_argument("--failfast", action="store_true", help="Stop execution immediately on first failure")
    parser.add_argument("--pattern", default="test_*.py", help="Test file pattern (default: test_*.py)")

    args = parser.parse_args()

    print_banner()

    tiers_to_run = ["1", "2", "3", "4"] if args.tier == "all" else [args.tier]

    results = {}
    total_start = time.time()

    for t in tiers_to_run:
        res = run_tier(t, verbose=args.verbose, failfast=args.failfast, pattern=args.pattern)
        results[t] = res
        if args.failfast and not res.wasSuccessful():
            print("\n[FAILFAST] Stopping test run after failure.")
            break

    total_elapsed = time.time() - total_start

    print("\n" + "=" * 70)
    print("                    E2E TEST EXECUTION SUMMARY")
    print("=" * 70)
    print(f"{'Tier':<35} | {'Ran':<6} | {'Pass':<6} | {'Fail':<6} | {'Err':<6} | {'Status'}")
    print("-" * 70)

    overall_success = True
    total_ran = 0
    total_passed = 0
    total_failed = 0
    total_errors = 0

    for t in tiers_to_run:
        res = results.get(t)
        if not res:
            continue
        title, _ = TIER_DIRS[t]
        ran = res.testsRun
        fails = len(res.failures)
        errs = len(res.errors)
        passed = ran - fails - errs
        status = "PASSED" if res.wasSuccessful() else "FAILED"
        if not res.wasSuccessful():
            overall_success = False

        total_ran += ran
        total_passed += passed
        total_failed += fails
        total_errors += errs

        print(f"{title:<35} | {ran:<6} | {passed:<6} | {fails:<6} | {errs:<6} | {status}")

    print("-" * 70)
    overall_status = "ALL TESTS PASSED" if overall_success else "TEST SUITE FAILED"
    print(f"{'TOTAL':<35} | {total_ran:<6} | {total_passed:<6} | {total_failed:<6} | {total_errors:<6} | {overall_status}")
    print(f"Total time: {total_elapsed:.3f}s")
    print("=" * 70)

    sys.exit(0 if overall_success else 1)

if __name__ == "__main__":
    main()
