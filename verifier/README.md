# Varanasi PoC verifier (v0, local/testnet only)

`varanasi_verifier.py` turns a hunter's PoC into a signed verdict for `RiskGuardEvaluator`.
Python 3 stdlib + Foundry (`forge`, `anvil`, `cast`). No other dependencies.

```
python3 verifier/varanasi_verifier.py --rpc http://127.0.0.1:18545 \
  --commerce <AgenticCommerce> --evaluator <RiskGuardEvaluator> --job <jobId> \
  --poc demo/pocs/ReentrancyExploit.sol --invariant demo/invariants/SolvencyInvariant.sol \
  --key <verifier test key> [--settle --relayer-key <key>] [--out verdict.json] [--dry-run]
```

## What it checks
1. Job is `Submitted`, its evaluator is this evaluator, and `keccak256(PoC bytes)` equals the on-chain deliverable. Otherwise it refuses to sign.
2. Job description (written by `BountyVault`) names the vault, bounty, tier, fork block and invariant hash; `keccak256(invariant source)` must equal the committed hash and the vault must be the job's client and hook.
3. Static policy on the PoC: one self-contained file with `contract Exploit { constructor(address target) payable; function run() external; }`; no cheatcodes, forge-std, ffi, fork/rpc/env/file cheats, inline assembly, selfdestruct, imports.
4. `forge build --offline` in a fresh temp project (`ffi=false`, `fs_permissions=[]`), scrubbed env, 120 s timeout, inside an empty network namespace (`unshare -rn`) when available.
5. A throwaway `anvil --fork-url <rpc> --fork-block-number <pinned>` on a random local port. A fresh attacker EOA gets a fixed 5 ETH budget. The invariant checker is deployed and must return `holds() == true`; the PoC is deployed and `run()` is sent as a real transaction (10M gas cap). PASS iff `holds()` is false afterwards.
6. The run log is hashed (`logsHash`) and `Verdict{jobId, deliverableHash, pass, logsHash}` is EIP-712 signed for the evaluator's domain with `cast wallet sign --data`.

## Why not `forge test`
Inside `forge test` every contract can call cheatcodes (`vm.deal`, `vm.store`), so a PoC could fake an invariant break. Here the PoC only ever executes as real transactions on anvil, where cheatcodes do not exist. The demo shows this with `CheatcodeExploit.sol` and `--dry-run --skip-policy`. `forge` is still used, for the sandboxed compile.

## Fail vs refuse
PoC-caused outcomes (policy violation, compile error, constructor revert, invariant still holds) are signed as FAIL and slash the bond. Infrastructure problems (RPC down, fork fails, invariant already broken at the fork block, solc missing) raise and nothing is signed, so the claim expires and the hunter gets the bond back via `BountyVault.reclaimExpired`.

## Known limits (v0)
- The network namespace covers compilation only. anvil itself needs the RPC; the PoC never runs outside anvil's EVM, but there is no container or egress firewall yet.
- The static policy is regex based (defense in depth, not the guarantee).
- `logs` include anvil-assigned addresses and gas, so `logsHash` is reproducible only from the saved log text, not by re-running.
- Single signer key from the CLI; production needs an HSM/KMS key, multiple verifiers, and a dispute path.
- Proves the exploit breaks the committed invariant at that block. It does not judge scope or severity beyond the tier the sponsor attached to that invariant.

Unit tests (no chain): `python3 -m unittest verifier/test_verifier.py`
