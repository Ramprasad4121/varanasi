"""
author: Varanasi E2E Test Suite
fixtures: Smart contract ABI definitions, deployed addresses, and tuple specifications.
"""
from typing import Dict, List, Tuple, Any

# Sepolia Contract Addresses (Chain ID 11155111)
TASK_ESCROW_ADDRESS = "0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24"
AEGIS_REGISTRY_ADDRESS = "0x3913f1E6A0Be93180363aBd01Df7968d494033A8"
RISK_GUARD_ADDRESS = "0x668c01aE564D51baFF0029D361c20c534d738400"
AEGIS_HOOK_ADDRESS = "0x05043B527D67d7E4e3a2ed411fFBD15b8255c080"
MOCK_ERC20_ADDRESS = "0x6169A84cD7430042fb697c2cC131F663212E8b30"  # vUSD 6 decimals

# Task State Enum
class TaskState:
    NONE = 0
    FUNDED = 1
    VALIDATED = 2
    RELEASED = 3
    REFUNDED = 4
    CANCELLED = 5

    @classmethod
    def label(cls, value: int) -> str:
        mapping = {
            0: "none",
            1: "funded",
            2: "validated",
            3: "released",
            4: "refunded",
            5: "cancelled",
        }
        return mapping.get(value, "unknown")

# Authoritative 14-field outputs specification for TaskEscrow.tasks(bytes32)
# Matches TaskEscrow.sol struct Task verbatim
TASK_TUPLE_FIELDS: List[Tuple[str, str]] = [
    ("payer", "address"),               # Index 0
    ("agent", "address"),               # Index 1
    ("merchant", "address"),            # Index 2
    ("token", "address"),               # Index 3
    ("cap", "uint256"),                 # Index 4
    ("fundedAmount", "uint256"),        # Index 5
    ("windowStart", "uint64"),          # Index 6
    ("windowEnd", "uint64"),            # Index 7
    ("expiry", "uint64"),               # Index 8
    ("scoreBps", "uint256"),            # Index 9
    ("validator", "address"),           # Index 10
    ("pinnedThresholdBps", "uint256"),  # Index 11 (Added in V2)
    ("pinnedValidator", "address"),     # Index 12 (Added in V2)
    ("state", "uint8"),                 # Index 13 (State Enum: 0..5)
]

def decode_task_tuple(raw_tuple: List[Any]) -> Dict[str, Any]:
    """
    Decodes a 14-field task tuple into a typed dictionary.
    Raises ValueError if tuple length is not exactly 14.
    """
    if len(raw_tuple) != 14:
        raise ValueError(
            f"Invalid TaskEscrow tuple length: expected 14 outputs, received {len(raw_tuple)}. "
            f"State must be mapped to index 13, not index 11."
        )
    return {
        "payer": str(raw_tuple[0]),
        "agent": str(raw_tuple[1]),
        "merchant": str(raw_tuple[2]),
        "token": str(raw_tuple[3]),
        "cap": int(raw_tuple[4]),
        "fundedAmount": int(raw_tuple[5]),
        "windowStart": int(raw_tuple[6]),
        "windowEnd": int(raw_tuple[7]),
        "expiry": int(raw_tuple[8]),
        "scoreBps": int(raw_tuple[9]),
        "validator": str(raw_tuple[10]),
        "pinnedThresholdBps": int(raw_tuple[11]),
        "pinnedValidator": str(raw_tuple[12]),
        "state": int(raw_tuple[13]),
        "stateLabel": TaskState.label(int(raw_tuple[13])),
    }

def create_mock_task(
    payer: str = "0x1111111111111111111111111111111111111111",
    agent: str = "0x2222222222222222222222222222222222222222",
    merchant: str = "0x3333333333333333333333333333333333333333",
    token: str = MOCK_ERC20_ADDRESS,
    cap: int = 100_000_000, # 100 vUSD
    funded: int = 100_000_000,
    window_start: int = 1700000000,
    window_end: int = 1700086400,
    expiry: int = 1700172800,
    score_bps: int = 8500,
    validator: str = "0x4444444444444444444444444444444444444444",
    pinned_threshold_bps: int = 5000,
    pinned_validator: str = "0x5555555555555555555555555555555555555555",
    state: int = TaskState.FUNDED,
) -> List[Any]:
    """Constructs an authoritative 14-field raw tuple representing onchain Task storage."""
    return [
        payer,
        agent,
        merchant,
        token,
        cap,
        funded,
        window_start,
        window_end,
        expiry,
        score_bps,
        validator,
        pinned_threshold_bps,
        pinned_validator,
        state,
    ]
