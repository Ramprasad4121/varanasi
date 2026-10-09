# Demo: PoC-gated bounty vault on ERC-8183 (local anvil)

One command, local chain only, anvil dev keys, mock USDC. Nothing touches a public network.

```
scripts/demo.sh        # needs Foundry (forge, anvil, cast), python3, jq
```

Recorded 2026-10-09 with forge/anvil/cast 1.8.5, solc 0.8.30. The transcript below is the unedited stdout+stderr of that run.

## What happens
1. Deploy mUSDC, `AgenticCommerce` (ERC-8183, 1% platform fee to treasury), `RiskGuardEvaluator` (one allowlisted verifier signer), `BountyVault`.
2. The protocol deploys a deliberately vulnerable `ReentrancyVault` (demo/src) and two users deposit 10 ETH.
3. The protocol funds bounty #1 with 10,000 mUSDC and commits `keccak256(demo/invariants/SolvencyInvariant.sol)` as tier 0, payout 5,000 mUSDC, bond 50 mUSDC.
4. Bob submits a slop PoC (normal deposit + withdraw). Verifier: invariant still holds, FAIL, signed, settled: bond slashed into the pot.
5. Mallory submits a PoC that fakes the drain with the `vm.deal` cheatcode. A dry run with the static policy switched off shows the call simply reverts on anvil (no cheatcodes there). The real run rejects it by policy, FAIL, bond slashed.
6. Alice submits a real reentrancy PoC pinned to the current block. Verifier: invariant held before, broken after, PASS, signed, settled: 5,000 mUSDC tier paid (4,950 to Alice, 50 fee), bond credited back and withdrawn.
7. Replaying Alice's verdict, reusing her signature on Bob's job, calling `complete` directly, and reopening the paid tier all revert.

## Balances (mUSDC)

| account | before | after | why |
|---|---:|---:|---|
| Sponsor wallet | 0.00 | 0.00 | its 10,000 sits in the vault (pot) |
| Alice (real PoC) | 100.00 | 5,050.00 | +4,950 tier net of 1% fee, bond 50 returned |
| Bob (slop PoC) | 100.00 | 50.00 | bond slashed |
| Mallory (forged PoC) | 100.00 | 50.00 | bond slashed |
| Treasury | 0.00 | 50.00 | 1% of the 5,000 tier |
| BountyVault | 10,000.00 | 5,100.00 | 10,000 - 5,000 paid + 2 x 50 slashed bonds |
| AgenticCommerce escrow | 0.00 | 0.00 | nothing stuck |
| Live ReentrancyVault | 10 ETH | 10 ETH | the exploit ran only on the verifier's throwaway fork |

Total mUSDC is conserved: 10,300 minted = 5,050 + 50 + 50 + 50 + 5,100.

## Honest limits
- The verifier is a v0 CLI with one local test key. It proves the PoC breaks the sponsor's committed invariant at the pinned block; it does not judge scope or severity beyond the tier the sponsor attached to that invariant.
- Compile runs with no network (`unshare -rn`); the fork anvil talks only to the given RPC. There is no container or egress firewall yet.
- The target, bounty and verifier all live on one local chain here. Cross-chain targets and a dispute path are backlog.

## Transcript
```

==== 0. local anvil chain on http://127.0.0.1:18545 ====
chain-id 31337, block 0

==== 1. build ====
contracts/ built
demo/ built

==== 2. deploy Varanasi stack (ERC-8183 AgenticCommerce + RiskGuardEvaluator + BountyVault) ====
mUSDC              0x5FbDB2315678afecb367f032d93F642f64180aa3
AgenticCommerce    0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512   (platform fee 1% -> treasury 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955)
RiskGuardEvaluator 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0   (allowlisted signer 0x90F79bf6EB2c4f870365E785982E1f101E93b906)
BountyVault        0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

==== 3. protocol deploys its (vulnerable) ReentrancyVault; users deposit 10 ETH ====
ReentrancyVault 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 holds 10.000000000000000000 ETH from 2 depositors

==== 4. protocol funds the bounty vault and commits the invariant + payout tier ====
bounty #1: pot 10,000 mUSDC (moved from sponsor wallet into the vault) | tier 0 'solvency' payout 5,000 mUSDC
           bond 50 mUSDC per claim | claim window 1 day | hunters were minted 100 mUSDC each
committed invariant = keccak256(demo/invariants/SolvencyInvariant.sol) = 0x919dfd4d824c97e51d37b2a28514d1e90dab7b14adcd04d2675a34c25f762281

==== BALANCES BEFORE ====
account                                     mUSDC
Sponsor wallet (protocol)                    0.00
Alice (real PoC)                           100.00
Bob (slop PoC)                             100.00
Mallory (forged PoC)                       100.00
Treasury (1% fee)                            0.00
BountyVault                             10,000.00
AgenticCommerce escrow                       0.00
Vault pot available                     10,000.00
Alice withdrawable bond credit               0.00
ReentrancyVault (live chain)     10.000000000000000000 ETH

==== 5. Bob (slop): posts 50 mUSDC bond, submits a PoC that breaks nothing ====
job 1  forkBlock 16  deliverable 0x926c0ebbf5b3acdf32510bd15ee8f49af89e81b3c158d8f8a2aa241006671034
    [verifier] job 1: PoC BogusExploit.sol keccak256=0x926c0ebbf5b3acdf32510bd15ee8f49af89e81b3c158d8f8a2aa241006671034
    [verifier] terms: bounty 1 tier 0 target 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 forkBlock 16 invariant 0x919dfd4d824c97e51d37b2a28514d1e90dab7b14adcd04d2675a34c25f762281
    [verifier] policy: ok (no cheatcodes/ffi/fork/env/assembly/imports)
    [verifier] compile: forge build --offline inside an empty network namespace (unshare -rn)
    [verifier] compile: ok
    [verifier] sandbox: anvil fork of RPC at block 16 on 127.0.0.1:<random port> (exploit runs only here)
    [verifier] attacker EOA 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720 funded on the fork; PoC gets 5 ETH budget
    [verifier] invariant before PoC: holds() = true
    [verifier] deployed Exploit at 0xa15bb66138824a1c7167f5e85b957d04dd34e468 with 5 ETH
    [verifier] Exploit.run(): status=success gasUsed=91248
    [verifier] invariant after PoC: holds() = true
    [verifier] FAIL invariant still holds after PoC
    [verifier] settle tx 0x593cf9ab9fdd5a805368823ef9e39e5c2ae697fd5628e6263a64e640f6e6c8f5 status 0x1
    {
      "jobId": 1,
      "pass": false,
      "deliverableHash": "0x926c0ebbf5b3acdf32510bd15ee8f49af89e81b3c158d8f8a2aa241006671034",
      "logsHash": "0x43b60de2572d3e231c6ec79f3e05fd07f987761ebc225c3b42fd307ee14fe605",
      "signer": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      "reason": "invariant still holds after PoC"
    }
job 1 status: Rejected

==== 6. Mallory (forger): PoC fakes the drain with a Foundry cheatcode (vm.deal) ====
job 2  forkBlock 19  deliverable 0x194a8e295d3291b01ad859ee4f8d9831b26ecb6e7e078556d77f9a4e749b8242
-- first, a dry run with the static policy switched OFF (nothing signed) to show the sandbox alone defeats it:
    [verifier] job 2: PoC CheatcodeExploit.sol keccak256=0x194a8e295d3291b01ad859ee4f8d9831b26ecb6e7e078556d77f9a4e749b8242
    [verifier] terms: bounty 1 tier 0 target 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 forkBlock 19 invariant 0x919dfd4d824c97e51d37b2a28514d1e90dab7b14adcd04d2675a34c25f762281
    [verifier] policy: SKIPPED (--skip-policy, dry-run only)
    [verifier] compile: forge build --offline inside an empty network namespace (unshare -rn)
    [verifier] compile: ok
    [verifier] sandbox: anvil fork of RPC at block 19 on 127.0.0.1:<random port> (exploit runs only here)
    [verifier] attacker EOA 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720 funded on the fork; PoC gets 5 ETH budget
    [verifier] invariant before PoC: holds() = true
    [verifier] deployed Exploit at 0xa15bb66138824a1c7167f5e85b957d04dd34e468 with 5 ETH
    [verifier] Exploit.run(): status=reverted gasUsed=24313
    [verifier] invariant after PoC: holds() = true
    [verifier] FAIL invariant still holds after PoC
-- real run (policy on), signed and settled:
    [verifier] job 2: PoC CheatcodeExploit.sol keccak256=0x194a8e295d3291b01ad859ee4f8d9831b26ecb6e7e078556d77f9a4e749b8242
    [verifier] terms: bounty 1 tier 0 target 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 forkBlock 19 invariant 0x919dfd4d824c97e51d37b2a28514d1e90dab7b14adcd04d2675a34c25f762281
    [verifier] REJECT policy: cheatcode address derivation
    [verifier] FAIL policy: cheatcode address derivation
    [verifier] settle tx 0xeaeb73bf7cb0c1b704c13acc1e8bf5dbdafb9d1d7c264a2289d77825c8848ea3 status 0x1
    {
      "jobId": 2,
      "pass": false,
      "deliverableHash": "0x194a8e295d3291b01ad859ee4f8d9831b26ecb6e7e078556d77f9a4e749b8242",
      "logsHash": "0x4953a02a521f62e07b338b003d55be7bed8c6e56fa5eb325863a789c2d59b678",
      "signer": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      "reason": "policy: cheatcode address derivation"
    }
job 2 status: Rejected

==== 7. Alice: real reentrancy PoC pinned to the current block ====
job 3  forkBlock 22  deliverable 0x1facd112cc0d2223cfa7560137cf94e14facbb5716cdf344c155112604ca4354
    [verifier] job 3: PoC ReentrancyExploit.sol keccak256=0x1facd112cc0d2223cfa7560137cf94e14facbb5716cdf344c155112604ca4354
    [verifier] terms: bounty 1 tier 0 target 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 forkBlock 22 invariant 0x919dfd4d824c97e51d37b2a28514d1e90dab7b14adcd04d2675a34c25f762281
    [verifier] policy: ok (no cheatcodes/ffi/fork/env/assembly/imports)
    [verifier] compile: forge build --offline inside an empty network namespace (unshare -rn)
    [verifier] compile: ok
    [verifier] sandbox: anvil fork of RPC at block 22 on 127.0.0.1:<random port> (exploit runs only here)
    [verifier] attacker EOA 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720 funded on the fork; PoC gets 5 ETH budget
    [verifier] invariant before PoC: holds() = true
    [verifier] deployed Exploit at 0xa15bb66138824a1c7167f5e85b957d04dd34e468 with 5 ETH
    [verifier] Exploit.run(): status=success gasUsed=173479
    [verifier] invariant after PoC: holds() = false
    [verifier] PASS invariant broken by PoC
    [verifier] settle tx 0x7c1279e569bb5385258c23422fbb2ff61544f728fa3bf091ca421ace7e5742cc status 0x1
    {
      "jobId": 3,
      "pass": true,
      "deliverableHash": "0x1facd112cc0d2223cfa7560137cf94e14facbb5716cdf344c155112604ca4354",
      "logsHash": "0x9f296549c390900c349cb3da9f3c97a7440f66acffe441584c7ff7d450a8338c",
      "signer": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      "reason": "invariant broken by PoC"
    }
job 3 status: Completed
Alice withdrew her 50 mUSDC bond credit

==== 8. attacks on settlement (each must revert) ====
replay Alice's PASS verdict on her settled job:               reverted (good)
reuse Alice's PASS signature to flip Bob's FAIL job:          reverted (good)
relayer calls AgenticCommerce.complete directly:              reverted (good)
anyone opens a new claim on the already-paid tier:            reverted (good)

==== BALANCES AFTER ====
account                                     mUSDC
Sponsor wallet (protocol)                    0.00
Alice (real PoC)                         5,050.00
Bob (slop PoC)                              50.00
Mallory (forged PoC)                        50.00
Treasury (1% fee)                           50.00
BountyVault                              5,100.00
AgenticCommerce escrow                       0.00
Vault pot available                      5,100.00
Alice withdrawable bond credit               0.00
ReentrancyVault (live chain)     10.000000000000000000 ETH

==== verdicts ====
{"jobId":1,"pass":false,"reason":"invariant still holds after PoC","deliverableHash":"0x926c0ebbf5b3acdf32510bd15ee8f49af89e81b3c158d8f8a2aa241006671034","logsHash":"0x43b60de2572d3e231c6ec79f3e05fd07f987761ebc225c3b42fd307ee14fe605","signer":"0x90F79bf6EB2c4f870365E785982E1f101E93b906","settleTx":"0x593cf9ab9fdd5a805368823ef9e39e5c2ae697fd5628e6263a64e640f6e6c8f5"}
{"jobId":2,"pass":false,"reason":"policy: cheatcode address derivation","deliverableHash":"0x194a8e295d3291b01ad859ee4f8d9831b26ecb6e7e078556d77f9a4e749b8242","logsHash":"0x4953a02a521f62e07b338b003d55be7bed8c6e56fa5eb325863a789c2d59b678","signer":"0x90F79bf6EB2c4f870365E785982E1f101E93b906","settleTx":"0xeaeb73bf7cb0c1b704c13acc1e8bf5dbdafb9d1d7c264a2289d77825c8848ea3"}
{"jobId":3,"pass":true,"reason":"invariant broken by PoC","deliverableHash":"0x1facd112cc0d2223cfa7560137cf94e14facbb5716cdf344c155112604ca4354","logsHash":"0x9f296549c390900c349cb3da9f3c97a7440f66acffe441584c7ff7d450a8338c","signer":"0x90F79bf6EB2c4f870365E785982E1f101E93b906","settleTx":"0x7c1279e569bb5385258c23422fbb2ff61544f728fa3bf091ca421ace7e5742cc"}

Note: the live ReentrancyVault still holds its 10 ETH. The exploit ran only on the verifier's
throwaway fork at the pinned block; the bounty paid on proof without anyone draining production.
```
