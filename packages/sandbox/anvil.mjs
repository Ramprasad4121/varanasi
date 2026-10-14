/**
 * @author Ramprasad
 * Optional local chain for the sandbox demo (`npm run sandbox:anvil`).
 *
 * Starts anvil, compiles contracts/src/AegisRegistry.sol on its own (no git
 * submodules needed), deploys it in mock ENS mode, and mints an identity for
 * the demo agent from the owner account. Revoking in the demo then calls
 * AegisRegistry.revokeAgent on this local chain. Local test chain only.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AEGIS_REGISTRY_ABI } from "@varanasi/sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

function bin(name) {
  const local = join(homedir(), ".foundry", "bin", name);
  if (existsSync(local)) return local;
  const found = spawnSync("which", [name], { encoding: "utf8" });
  if (found.status === 0) return found.stdout.trim();
  throw new Error(`${name} not found. Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup`);
}

function compileRegistry() {
  const src = fileURLToPath(new URL("../../contracts/src/", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "varanasi-registry-"));
  mkdirSync(join(root, "src", "interfaces"), { recursive: true });
  copyFileSync(join(src, "AegisRegistry.sol"), join(root, "src", "AegisRegistry.sol"));
  copyFileSync(join(src, "interfaces", "IENSv2.sol"), join(root, "src", "interfaces", "IENSv2.sol"));
  const out = spawnSync(
    bin("forge"),
    ["build", "src/AegisRegistry.sol", "--root", root, "--contracts", "src", "-o", join(root, "out")],
    { encoding: "utf8" },
  );
  if (out.status !== 0) throw new Error(`forge build failed:\n${out.stderr || out.stdout}`);
  const artifact = JSON.parse(readFileSync(join(root, "out", "AegisRegistry.sol", "AegisRegistry.json"), "utf8"));
  return artifact.bytecode.object;
}

function startAnvil(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin("anvil"), ["--port", String(port), "--silent"], { stdio: ["ignore", "pipe", "pipe"] });
    const url = `http://127.0.0.1:${port}`;
    let tries = 0;
    const poll = async () => {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        });
        if (r.ok) return resolve({ proc, url });
      } catch {}
      if (++tries > 100) {
        proc.kill();
        return reject(new Error("anvil did not start"));
      }
      setTimeout(poll, 100);
    };
    proc.on("error", reject);
    poll();
  });
}

/** Start anvil, deploy AegisRegistry, mint the agent identity. */
export async function startAnvilRegistry({ ownerKey, agent }) {
  const bytecode = compileRegistry();
  const port = 18545 + Math.floor(Math.random() * 1000);
  const { proc, url } = await startAnvil(port);
  const account = privateKeyToAccount(ownerKey);
  const publicClient = createPublicClient({ chain: foundry, transport: http(url) });
  const wallet = createWalletClient({ chain: foundry, transport: http(url), account });
  const zero = "0x0000000000000000000000000000000000000000";
  const deployHash = await wallet.deployContract({
    abi: AEGIS_REGISTRY_ABI,
    bytecode,
    args: [zero, zero, zero, "aegis.eth"],
  });
  const { contractAddress: registry } = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const mintHash = await wallet.writeContract({
    address: registry,
    abi: AEGIS_REGISTRY_ABI,
    functionName: "mintAgent",
    args: ["demo-agent", agent, 30n],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  const tokenId = await publicClient.readContract({
    address: registry,
    abi: AEGIS_REGISTRY_ABI,
    functionName: "tokenByAgent",
    args: [agent],
  });
  // OnchainBackend passes the owner address as `account`; sign locally with the test key.
  const walletClient = {
    writeContract: (a) => wallet.writeContract({ ...a, account, chain: foundry }),
  };
  return {
    rpcUrl: url,
    registry,
    tokenId,
    publicClient,
    walletClient,
    stop: async () => {
      proc.kill();
    },
  };
}
