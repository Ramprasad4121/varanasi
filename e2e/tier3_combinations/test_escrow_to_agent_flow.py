"""
author: Varanasi E2E Test Suite
tier: Tier 3 - Cross-Feature Combinations
combination: Escrow State Tuple -> Freelancer Worker Settlement
spec: contracts/src/TaskEscrow.sol, agent/src/workers/freelancer.ts, agent/src/escrow.ts
"""
import unittest
import time
from e2e.fixtures.abi_fixtures import (
    TaskState,
    decode_task_tuple,
    create_mock_task,
)
from e2e.fixtures.eip712_fixtures import build_mandate_message

def decide_freelancer_action(task_state: int, expiry: int, now_sec: int) -> str:
    """
    Python mirror of pure core decideFreelancerAction in agent/src/workers/freelancer.ts:
      switch (task.state) {
        case 2: return 'released';
        case 1: return nowSec > expiry ? 'refunded' : 'pending';
        case 3: case 4: case 5: return 'noop';
        default: return 'pending';
      }
    """
    if task_state == TaskState.VALIDATED:
        return "released"
    elif task_state == TaskState.FUNDED:
        return "refunded" if now_sec > expiry else "pending"
    elif task_state in (TaskState.RELEASED, TaskState.REFUNDED, TaskState.CANCELLED):
        return "noop"
    else:
        return "pending"


class TestEscrowToAgentFlow(unittest.TestCase):
    """
    Validates the end-to-end data pipeline from TaskEscrow's 14-field onchain tuple
    to Freelancer settlement decision logic.
    """

    def test_01_funded_task_before_expiry_is_pending(self):
        """A funded task (state 1) with future expiry must yield 'pending' action."""
        now = int(time.time())
        expiry = now + 86400  # 1 day in the future
        raw_tuple = create_mock_task(state=TaskState.FUNDED, expiry=expiry)
        decoded = decode_task_tuple(raw_tuple)
        
        self.assertEqual(decoded["state"], TaskState.FUNDED)
        action = decide_freelancer_action(decoded["state"], decoded["expiry"], now)
        self.assertEqual(action, "pending", "Funded task before expiry must not trigger refund or release")

    def test_02_funded_task_past_expiry_triggers_refund(self):
        """A funded task (state 1) with past expiry must yield 'refunded' action."""
        now = int(time.time())
        expiry = now - 3600  # Expired 1 hour ago
        raw_tuple = create_mock_task(state=TaskState.FUNDED, expiry=expiry)
        decoded = decode_task_tuple(raw_tuple)
        
        self.assertEqual(decoded["state"], TaskState.FUNDED)
        action = decide_freelancer_action(decoded["state"], decoded["expiry"], now)
        self.assertEqual(action, "refunded", "Funded task past expiry must trigger refund")

    def test_03_validated_task_triggers_release_regardless_of_clock(self):
        """A validated task (state 2) must immediately trigger 'released' action."""
        now = int(time.time())
        # Both before and after nominal expiry, validated state takes precedence
        for expiry_offset in [3600, -3600]:
            raw_tuple = create_mock_task(state=TaskState.VALIDATED, expiry=now + expiry_offset)
            decoded = decode_task_tuple(raw_tuple)
            
            self.assertEqual(decoded["state"], TaskState.VALIDATED)
            action = decide_freelancer_action(decoded["state"], decoded["expiry"], now)
            self.assertEqual(action, "released", "Validated task must release payment immediately")

    def test_04_terminal_states_yield_noop(self):
        """Terminal states (Released=3, Refunded=4, Cancelled=5) must yield 'noop'."""
        now = int(time.time())
        terminal_states = [TaskState.RELEASED, TaskState.REFUNDED, TaskState.CANCELLED]
        
        for st in terminal_states:
            raw_tuple = create_mock_task(state=st, expiry=now)
            decoded = decode_task_tuple(raw_tuple)
            action = decide_freelancer_action(decoded["state"], decoded["expiry"], now)
            self.assertEqual(action, "noop", f"State {st} ({decoded['stateLabel']}) must result in noop")

    def test_05_uninitialized_or_unknown_state_fail_closed_to_pending(self):
        """State 0 (None) or an out-of-range state must fail-closed to 'pending'."""
        now = int(time.time())
        for st in [TaskState.NONE, 99]:
            action = decide_freelancer_action(st, expiry=now - 1000, now_sec=now)
            self.assertEqual(action, "pending", "Unknown/None states must never broadcast speculative actions")

    def test_06_14_field_tuple_mapping_preserves_score_and_pinned_fields(self):
        """Verifies that scoreBps, pinnedThresholdBps, and pinnedValidator are intact and not collided with state."""
        raw_tuple = create_mock_task(
            score_bps=9500,
            pinned_threshold_bps=8000,
            pinned_validator="0x668c01aE564D51baFF0029D361c20c534d738400",
            state=TaskState.VALIDATED,
        )
        decoded = decode_task_tuple(raw_tuple)
        self.assertEqual(decoded["scoreBps"], 9500)
        self.assertEqual(decoded["pinnedThresholdBps"], 8000)
        self.assertEqual(decoded["pinnedValidator"], "0x668c01aE564D51baFF0029D361c20c534d738400")
        self.assertEqual(decoded["state"], TaskState.VALIDATED)
        self.assertTrue(decoded["scoreBps"] >= decoded["pinnedThresholdBps"])


if __name__ == "__main__":
    unittest.main()
