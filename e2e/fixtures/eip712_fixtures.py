"""
author: Varanasi E2E Test Suite
fixtures: EIP-712 Mandate typed data definitions, domain parameters, and validation utilities.
"""
from typing import Dict, Any

MANDATE_DOMAIN: Dict[str, Any] = {
    "name": "TaskEscrow",
    "version": "1",
    "chainId": 11155111,
    "verifyingContract": "0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24",
}

MANDATE_TYPES: Dict[str, Any] = {
    "EIP712Domain": [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ],
    "Mandate": [
        {"name": "agent", "type": "address"},
        {"name": "merchant", "type": "address"},
        {"name": "token", "type": "address"},
        {"name": "cap", "type": "uint256"},
        {"name": "windowStart", "type": "uint64"},
        {"name": "windowEnd", "type": "uint64"},
        {"name": "expiry", "type": "uint64"},
        {"name": "nonce", "type": "uint256"},
        {"name": "chainId", "type": "uint256"},
    ],
}

def build_mandate_message(
    agent: str = "0x2222222222222222222222222222222222222222",
    merchant: str = "0x3333333333333333333333333333333333333333",
    token: str = "0x6169A84cD7430042fb697c2cC131F663212E8b30",
    cap: int = 100_000_000,
    window_start: int = 1700000000,
    window_end: int = 1700086400,
    expiry: int = 1700172800,
    nonce: int = 1,
    chain_id: int = 11155111,
) -> Dict[str, Any]:
    return {
        "agent": agent,
        "merchant": merchant,
        "token": token,
        "cap": cap,
        "windowStart": window_start,
        "windowEnd": window_end,
        "expiry": expiry,
        "nonce": nonce,
        "chainId": chain_id,
    }

def validate_mandate_structure(mandate: Dict[str, Any]) -> None:
    required_fields = [
        "agent", "merchant", "token", "cap", "windowStart",
        "windowEnd", "expiry", "nonce", "chainId"
    ]
    for f in required_fields:
        if f not in mandate:
            raise KeyError(f"Missing required Mandate field: '{f}'")
    if mandate["windowEnd"] <= mandate["windowStart"]:
        raise ValueError("windowEnd must be strictly greater than windowStart")
    if mandate["expiry"] < mandate["windowEnd"]:
        raise ValueError("expiry must be greater than or equal to windowEnd")
    if mandate["chainId"] != 11155111:
        raise ValueError(f"Invalid chainId: expected 11155111 (Sepolia), got {mandate['chainId']}")
