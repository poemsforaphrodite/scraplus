import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";

const PORT = 3999;
let server: ChildProcess;

function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val === "") continue; // skip empty values
    env[key] = val;
  }
  return env;
}

function waitReady(port: number, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Server did not start within ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const poll = () => {
      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/scrape`,
        { method: "POST" },
        (res) => {
          res.resume();
          clearTimeout(timer);
          resolve();
        },
      );
      req.on("error", () => {
        setTimeout(poll, 300);
      });
    };
    poll();
  });
}

export default async function setup() {
  // Kill any stale process on the same port
  try {
    const { execSync } = await import("node:child_process");
    const lsof = execSync(`lsof -ti:${PORT}`, { encoding: "utf-8" }).trim();
    if (lsof) {
      for (const pid of lsof.split("\n")) {
        try { process.kill(Number(pid), "SIGKILL"); } catch {}
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch {}

  // Load .env.local and merge with current process.env
  const envFile = path.resolve(__dirname, "..", ".env.local");
  const fileEnv = fs.existsSync(envFile) ? loadEnvFile(envFile) : {};
  const mergedEnv = { ...process.env, ...fileEnv };

  // Verify required vars
  if (!mergedEnv.SCRAPLUS_MODAL_BASE_URL) {
    throw new Error("SCRAPLUS_MODAL_BASE_URL not set in .env.local");
  }
  if (!mergedEnv.SCRAPLUS_PROXY_SECRET) {
    throw new Error("SCRAPLUS_PROXY_SECRET not set in .env.local");
  }

  server = spawn("npx", ["next", "dev", "--port", String(PORT), "--turbopack"], {
    stdio: "pipe",
    env: mergedEnv,
    cwd: path.resolve(__dirname, ".."),
  });

  server.stdout?.on("data", (d: Buffer) => {
    const msg = d.toString().trim();
    if (msg) console.log("[next-dev]", msg);
  });
  server.stderr?.on("data", (d: Buffer) => {
    const msg = d.toString().trim();
    if (msg) console.error("[next-dev:err]", msg);
  });
  server.on("error", (err) => {
    console.error("[next-dev] spawn error:", err);
  });

  await waitReady(PORT);
  console.log(`[setup] Next.js dev server ready on port ${PORT}`);
}

export async function teardown() {
  if (server) {
    server.kill("SIGTERM");
    await new Promise<void>((r) => {
      server.on("exit", () => r());
      setTimeout(r, 5000);
    });
  }
}
