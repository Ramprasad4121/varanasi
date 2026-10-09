#!/usr/bin/env python3
"""Varanasi PoC verifier (v0, local/testnet only).

Given an ERC-8183 job opened by BountyVault, a hunter's Foundry PoC file and the sponsor's
invariant checker source, it:

  1. reads the job on-chain (status must be Submitted) and checks keccak256(PoC bytes) equals the
     deliverable the hunter submitted, and keccak256(invariant source) equals the invariant hash the
     sponsor committed for that tier;
  2. copies the PoC + invariant into a fresh temp Foundry project and applies a static policy
     (no cheatcodes, ffi, fork/rpc/env/file cheats, selfdestruct, inline assembly, imports);
  3. compiles with `forge build --offline` inside an empty network namespace (`unshare -rn`, no
     network at all) with a scrubbed environment and a hard timeout;
  4. starts a throwaway anvil forked from the RPC at the claim's pinned fork block (the only
     process that talks to the network, and only to that RPC), funds a fresh attacker EOA with a
     fixed budget, deploys the invariant checker, asserts holds()==true, deploys the PoC as
     `Exploit(target)` and calls run() as a real transaction (no cheatcodes exist on anvil), then
     reads holds() again. PASS iff the invariant held before and is broken after;
  5. hashes the run log, and signs the EIP-712 Verdict{jobId, deliverableHash, pass, logsHash}
     for RiskGuardEvaluator with the verifier key; optionally relays settle() on-chain.

Why not plain `forge test`: inside forge every contract can call cheatcodes (vm.deal, vm.store),
so a PoC could fake an invariant break. Running the exploit as real anvil transactions removes that.
Only stdlib + Foundry binaries (forge, anvil, cast) are used.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

FOUNDRY_BIN = Path(os.environ.get("FOUNDRY_BIN", Path.home() / ".foundry" / "bin"))
FORGE = str(FOUNDRY_BIN / "forge")
ANVIL = str(FOUNDRY_BIN / "anvil")
CAST = str(FOUNDRY_BIN / "cast")
SOLC_VERSION = "0.8.30"
# local RPCs (the sandbox fork) must never go through an HTTP proxy
for _k in ("NO_PROXY", "no_proxy"):
    os.environ[_k] = ",".join(x for x in ("127.0.0.1", "localhost", os.environ.get(_k, "")) if x)

JOB_SIG = "getJob(uint256)((address,address,address,address,uint256,uint256,uint8,bytes32,string))"
STATUS_SUBMITTED = 2
# Fresh attacker EOA for the sandbox fork (well-known anvil dev key #9; never holds real funds).
ATTACKER_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"
ATTACKER_BUDGET_WEI = 5 * 10**18
EXPLOIT_GAS = 10_000_000

# Static policy (defense in depth; the anvil execution model is the real guarantee).
BANNED = [
    (r"\bvm\s*\.", "Foundry cheatcode use (vm.)"),
    (r"hevm\s+cheat\s+code", "cheatcode address derivation"),
    (r"7109709ecfa91a80626ff3989d68f67f5b1dd12d", "cheatcode address literal"),
    (r"forge-std", "forge-std import (PoC must be a plain contract)"),
    (r"\bffi\b", "ffi"),
    (r"createSelectFork|createFork|selectFork|rpcUrl|\brpc\s*\(", "fork/rpc cheat"),
    (r"envString|envUint|envAddress|envBytes|readFile|writeFile", "env/file cheat"),
    (r"\bselfdestruct\b", "selfdestruct"),
    (r"\bassembly\b", "inline assembly"),
    (r"^\s*import\s", "imports (PoC must be a single self-contained file)"),
]


class VerifierError(Exception):
    pass


def log(msg: str, sink: list[str]) -> None:
    line = msg.rstrip()
    sink.append(line)
    print(f"[verifier] {line}", file=sys.stderr)


def run(cmd: list[str], *, timeout: int = 60, env: dict | None = None, cwd: str | None = None, check: bool = True) -> str:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env, cwd=cwd)
    except subprocess.TimeoutExpired as e:
        raise VerifierError(f"timeout after {timeout}s: {' '.join(cmd[:3])}") from e
    if check and p.returncode != 0:
        raise VerifierError(f"command failed ({p.returncode}): {' '.join(cmd[:4])}\n{p.stderr.strip()[-2000:]}")
    return p.stdout.strip()


def keccak_bytes(data: bytes) -> str:
    p = subprocess.run([CAST, "keccak"], input="0x" + data.hex(), capture_output=True, text=True, timeout=30)
    if p.returncode != 0:
        raise VerifierError("cast keccak failed: " + p.stderr)
    return p.stdout.strip().lower()


def cast_call(rpc: str, to: str, sig: str, *args: str) -> list:
    out = run([CAST, "call", "--json", "--rpc-url", rpc, to, sig, *args], timeout=30)
    return json.loads(out)


def parse_job(raw) -> dict:
    v = raw[0] if isinstance(raw, list) and len(raw) == 1 else raw
    if isinstance(v, str):  # some cast versions return the tuple as one string
        v = v.strip()
        m = re.match(
            r"^\((0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}), "
            r"(\d+)[^,]*, (\d+)[^,]*, (\d+), (0x[0-9a-fA-F]{64}), \"(.*)\"\)$",
            v,
            re.S,
        )
        if not m:
            raise VerifierError(f"cannot parse job tuple: {v[:200]}")
        v = list(m.groups())
    keys = ["client", "provider", "evaluator", "hook", "budget", "expiredAt", "status", "deliverable", "description"]
    job = dict(zip(keys, v))
    job["status"] = int(job["status"])
    job["deliverable"] = str(job["deliverable"]).lower()
    return job


def parse_description(desc: str) -> dict:
    m = re.fullmatch(
        r"varanasi-bounty:v1:vault=(0x[0-9a-f]{40}):bounty=(\d+):tier=(\d+):forkBlock=(\d+):invariant=(0x[0-9a-f]{64})",
        desc,
    )
    if not m:
        raise VerifierError(f"job is not a Varanasi bounty claim: {desc[:120]!r}")
    vault, bounty, tier, fork_block, inv = m.groups()
    return {"vault": vault, "bountyId": int(bounty), "tierId": int(tier), "forkBlock": int(fork_block), "invariantHash": inv}


def policy_check(src: str) -> list[str]:
    hits = []
    for pat, why in BANNED:
        if re.search(pat, src, re.I | re.M):
            hits.append(why)
    if not re.search(r"\bcontract\s+Exploit\b", src):
        hits.append("missing `contract Exploit` (interface: constructor(address target) payable; run())")
    return hits


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def solc_path() -> str:
    for base in (Path.home() / ".svm", Path.home() / ".local" / "share" / "svm"):
        p = base / SOLC_VERSION / f"solc-{SOLC_VERSION}"
        if p.exists():
            return str(p)
    raise VerifierError(f"solc {SOLC_VERSION} not installed (run `forge build` once in contracts/)")


def sandbox_build(work: Path, poc_src: str, inv_src: str, sink: list[str]) -> tuple[str, str]:
    (work / "src").mkdir(parents=True)
    (work / "src" / "Exploit.sol").write_text(poc_src)
    (work / "src" / "Invariant.sol").write_text(inv_src)
    (work / "foundry.toml").write_text(
        "[profile.default]\nsrc='src'\nout='out'\nlibs=[]\nffi=false\nfs_permissions=[]\noffline=true\n"
    )
    env = {"PATH": "/usr/bin:/bin", "HOME": str(work), "FOUNDRY_OFFLINE": "true"}
    cmd = [FORGE, "build", "--offline", "--use", solc_path(), "--root", str(work)]
    if shutil.which("unshare") and subprocess.run(["unshare", "-rn", "true"], capture_output=True).returncode == 0:
        cmd = ["unshare", "-rn", *cmd]
        log("compile: forge build --offline inside an empty network namespace (unshare -rn)", sink)
    else:
        log("compile: forge build --offline (WARNING: no network namespace available)", sink)
    run(cmd, timeout=120, env=env, cwd=str(work))

    def bytecode(fname: str, cname: str) -> str:
        art = json.loads((work / "out" / fname / f"{cname}.json").read_text())
        return art["bytecode"]["object"]

    m = re.search(r"\bcontract\s+(\w+)", re.sub(r"\binterface\s+\w+\s*\{[^}]*\}", "", inv_src, flags=re.S))
    if not m:
        raise VerifierError("invariant source has no contract")
    return bytecode("Exploit.sol", "Exploit"), bytecode("Invariant.sol", m.group(1))


def _anvil_env() -> dict:
    # scrubbed env; only proxy settings are forwarded so a remote RPC stays reachable
    env = {"PATH": "/usr/bin:/bin", "HOME": tempfile.gettempdir()}
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy"):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


def start_fork(rpc: str, fork_block: int, sink: list[str]) -> tuple[subprocess.Popen, str]:
    port = free_port()
    proc = subprocess.Popen(
        [ANVIL, "--fork-url", rpc, "--fork-block-number", str(fork_block), "--port", str(port), "--silent"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=_anvil_env(),
        start_new_session=True,
    )
    url = f"http://127.0.0.1:{port}"
    for _ in range(100):
        if proc.poll() is not None:
            raise VerifierError("sandbox anvil exited (bad RPC or fork block?)")
        try:
            run([CAST, "block-number", "--rpc-url", url], timeout=5)
            break
        except VerifierError:
            time.sleep(0.2)
    else:
        raise VerifierError("sandbox anvil did not start")
    log(f"sandbox: anvil fork of RPC at block {fork_block} on 127.0.0.1:<random port> (exploit runs only here)", sink)
    return proc, url


def send(url: str, key: str, args: list[str], timeout: int = 60) -> dict:
    out = run([CAST, "send", "--json", "--rpc-url", url, "--private-key", key, *args], timeout=timeout)
    return json.loads(out)


def deploy(url: str, key: str, code: str, ctor_args: list[str], value: str | None = None) -> tuple[str, dict]:
    data = code
    if ctor_args:
        data += run([CAST, "abi-encode", "constructor(address)", *ctor_args])[2:]
    args = ["--create", data]
    if value:
        args = ["--value", value, *args]
    rc = send(url, key, args)
    if rc.get("status") not in ("0x1", 1, "1"):
        raise VerifierError(f"deploy reverted: {rc.get('transactionHash')}")
    return rc["contractAddress"], rc


def holds(url: str, inv_addr: str) -> bool:
    out = run([CAST, "call", "--rpc-url", url, inv_addr, "holds()(bool)"], timeout=30)
    return out.strip() == "true"


def sign_verdict(key: str, chain_id: int, evaluator: str, job_id: int, deliverable: str, passed: bool, logs_hash: str, work: Path) -> str:
    typed = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "Verdict": [
                {"name": "jobId", "type": "uint256"},
                {"name": "deliverableHash", "type": "bytes32"},
                {"name": "pass", "type": "bool"},
                {"name": "logsHash", "type": "bytes32"},
            ],
        },
        "primaryType": "Verdict",
        "domain": {"name": "Varanasi RiskGuardEvaluator", "version": "1", "chainId": chain_id, "verifyingContract": evaluator},
        "message": {"jobId": job_id, "deliverableHash": deliverable, "pass": passed, "logsHash": logs_hash},
    }
    f = work / "verdict-typed.json"
    f.write_text(json.dumps(typed))
    return run([CAST, "wallet", "sign", "--data", "--from-file", str(f), "--private-key", key], timeout=30)


def run_poc(a, terms: dict, target: str, poc_src: str, inv_src: str, work: Path, sink: list[str]) -> tuple[bool, str]:
    """Returns (passed, reason) for PoC-attributable outcomes. Infrastructure errors raise."""
    violations = [] if a.skip_policy else policy_check(poc_src)
    if a.skip_policy:
        log("policy: SKIPPED (--skip-policy, dry-run only)", sink)
    if violations:
        reason = "policy: " + "; ".join(violations)
        log(f"REJECT {reason}", sink)
        return False, reason
    if not a.skip_policy:
        log("policy: ok (no cheatcodes/ffi/fork/env/assembly/imports)", sink)
    try:
        exploit_code, inv_code = sandbox_build(work, poc_src, inv_src, sink)
        log("compile: ok", sink)
    except VerifierError as e:
        reason = "PoC does not compile: " + str(e).splitlines()[-1][:200]
        log(reason, sink)
        return False, reason

    proc, url = start_fork(a.rpc, terms["forkBlock"], sink)
    try:
        attacker = run([CAST, "wallet", "address", "--private-key", ATTACKER_KEY])
        run([CAST, "rpc", "--rpc-url", url, "anvil_setBalance", attacker, hex(ATTACKER_BUDGET_WEI + 10**18)])
        log(f"attacker EOA {attacker} funded on the fork; PoC gets {ATTACKER_BUDGET_WEI // 10**18} ETH budget", sink)
        inv_addr, _ = deploy(url, ATTACKER_KEY, inv_code, [target])
        pre = holds(url, inv_addr)
        log(f"invariant before PoC: holds() = {str(pre).lower()}", sink)
        if not pre:
            raise VerifierError("invariant already broken at the fork block; not the hunter's fault, no verdict signed")
        try:
            exp_addr, _ = deploy(url, ATTACKER_KEY, exploit_code, [target], value=str(ATTACKER_BUDGET_WEI))
            log(f"deployed Exploit at {exp_addr} with {ATTACKER_BUDGET_WEI // 10**18} ETH", sink)
        except VerifierError as e:
            exp_addr = None
            log(f"Exploit constructor reverted ({str(e).splitlines()[0][:160]})", sink)
        if exp_addr:
            try:
                rc = send(url, ATTACKER_KEY, ["--gas-limit", str(EXPLOIT_GAS), exp_addr, "run()"], timeout=a.timeout)
                ok = rc.get("status") in ("0x1", 1, "1")
                log(f"Exploit.run(): status={'success' if ok else 'reverted'} gasUsed={int(str(rc.get('gasUsed')), 0)}", sink)
            except VerifierError as e:
                log(f"Exploit.run(): reverted ({str(e).splitlines()[0][:160]})", sink)
        post = holds(url, inv_addr)
        log(f"invariant after PoC: holds() = {str(post).lower()}", sink)
        passed = pre and not post
        return passed, ("invariant broken by PoC" if passed else "invariant still holds after PoC")
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGKILL)


def verify(a: argparse.Namespace) -> dict:
    sink: list[str] = []
    solc_path()  # infrastructure precondition: refuse (no verdict) rather than FAIL the hunter
    poc_bytes = Path(a.poc).read_bytes()
    inv_bytes = Path(a.invariant).read_bytes()
    deliverable = keccak_bytes(poc_bytes)
    inv_hash = keccak_bytes(inv_bytes)
    log(f"job {a.job}: PoC {Path(a.poc).name} keccak256={deliverable}", sink)

    job = parse_job(cast_call(a.rpc, a.commerce, JOB_SIG, str(a.job)))
    if job["status"] != STATUS_SUBMITTED:
        raise VerifierError(f"job {a.job} status {job['status']} is not Submitted; nothing to verify")
    if job["deliverable"] != deliverable:
        raise VerifierError(f"PoC does not match the on-chain deliverable ({job['deliverable']}); refusing to sign")
    terms = parse_description(job["description"])
    if terms["vault"] != job["client"].lower() or job["hook"].lower() != terms["vault"]:
        raise VerifierError("job client/hook is not the vault named in its terms")
    if job["evaluator"].lower() != a.evaluator.lower():
        raise VerifierError("job evaluator is not this verifier's evaluator contract")
    if terms["invariantHash"] != inv_hash:
        raise VerifierError(f"invariant source hash {inv_hash} != committed {terms['invariantHash']}")
    info = cast_call(
        a.rpc, terms["vault"], "bountyInfo(uint256)(address,address,uint64,uint64,uint256,uint256,uint256,uint256)",
        str(terms["bountyId"]),
    )
    target = info[1]
    log(f"terms: bounty {terms['bountyId']} tier {terms['tierId']} target {target} forkBlock {terms['forkBlock']} invariant {inv_hash}", sink)

    work = Path(tempfile.mkdtemp(prefix="varanasi-verify-"))
    try:
        passed, reason = run_poc(a, terms, target, poc_bytes.decode("utf-8"), inv_bytes.decode("utf-8"), work, sink)
        log(("PASS " if passed else "FAIL ") + reason, sink)
        logs_text = "\n".join(sink) + "\n"
        logs_hash = keccak_bytes(logs_text.encode())
        if a.dry_run:
            return {"jobId": a.job, "pass": passed, "deliverableHash": deliverable, "logsHash": logs_hash,
                    "signer": None, "reason": reason + " (dry run: not signed)", "logs": logs_text}
        chain_id = int(run([CAST, "chain-id", "--rpc-url", a.rpc]))
        sig = sign_verdict(a.key, chain_id, a.evaluator, a.job, deliverable, passed, logs_hash, work)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    signer = run([CAST, "wallet", "address", "--private-key", a.key])
    verdict = {
        "jobId": a.job,
        "deliverableHash": deliverable,
        "pass": passed,
        "logsHash": logs_hash,
        "signature": sig,
        "signer": signer,
        "evaluator": a.evaluator,
        "chainId": chain_id,
        "reason": reason,
        "terms": terms,
        "logs": logs_text,
    }
    if a.settle:
        rc = send(a.rpc, a.relayer_key or a.key, [a.evaluator, "settle(uint256,bytes32,bool,bytes32,bytes)",
                  str(a.job), deliverable, "true" if passed else "false", logs_hash, sig])
        verdict["settleTx"] = rc.get("transactionHash")
        verdict["settleStatus"] = rc.get("status")
        print(f"[verifier] settle tx {verdict['settleTx']} status {verdict['settleStatus']}", file=sys.stderr)
    if a.out:
        Path(a.out).write_text(json.dumps(verdict, indent=2))
    return verdict


def main() -> int:
    ap = argparse.ArgumentParser(description="Varanasi PoC verifier (local/testnet only)")
    ap.add_argument("--rpc", required=True, help="RPC of the chain holding the job and the target")
    ap.add_argument("--commerce", required=True, help="AgenticCommerce address")
    ap.add_argument("--evaluator", required=True, help="RiskGuardEvaluator address")
    ap.add_argument("--job", required=True, type=int)
    ap.add_argument("--poc", required=True, help="hunter PoC .sol file (contract Exploit)")
    ap.add_argument("--invariant", required=True, help="sponsor invariant checker .sol (hash must match commit)")
    ap.add_argument("--key", default=os.environ.get("VERIFIER_KEY"), help="verifier signing key (local test key)")
    ap.add_argument("--relayer-key", default=os.environ.get("RELAYER_KEY"))
    ap.add_argument("--timeout", type=int, default=60, help="seconds for the exploit tx")
    ap.add_argument("--out", help="write verdict JSON here")
    ap.add_argument("--settle", action="store_true", help="relay settle() to the evaluator")
    ap.add_argument("--dry-run", action="store_true", help="run the PoC but do not sign or settle")
    ap.add_argument("--skip-policy", action="store_true", help="(dry-run only) skip the static policy to show the sandbox alone holds")
    a = ap.parse_args()
    if a.skip_policy and not a.dry_run:
        ap.error("--skip-policy is only allowed with --dry-run")
    if not a.key and not a.dry_run:
        ap.error("--key or VERIFIER_KEY required")
    try:
        v = verify(a)
    except VerifierError as e:
        print(f"[verifier] refused (no verdict signed): {e}", file=sys.stderr)
        return 2
    print(json.dumps({k: v.get(k) for k in ("jobId", "pass", "deliverableHash", "logsHash", "signer", "reason")}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
