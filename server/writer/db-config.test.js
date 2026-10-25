// node --test server/writer/db-config.test.js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { DEFAULT_CA, poolConfig } from "./db-config.js";

const REMOTE = "postgres://arma_writer.ref:pw@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require";

test("a remote database pins the Supabase root with verification ON, and sslmode is not left to override it", () => {
  const cfg = poolConfig(REMOTE);
  assert.equal(cfg.ssl.rejectUnauthorized, true);
  assert.match(cfg.ssl.ca, /BEGIN CERTIFICATE/);
  assert.ok(!cfg.connectionString.includes("sslmode"), "pg would let the URL's sslmode replace the ssl object");
  assert.equal(new URL(cfg.connectionString).hostname, "aws-1-eu-central-1.pooler.supabase.com");
});

test("the shipped certificate is Supabase's root CA (pinned fingerprint)", () => {
  const cert = new crypto.X509Certificate(fs.readFileSync(DEFAULT_CA));
  assert.equal(cert.fingerprint256, "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA");
  assert.match(cert.subject, /Supabase Root 2021 CA/);
});

test("a remote database without TLS is refused; loopback may be plain; no mode ever disables verification", () => {
  assert.throws(() => poolConfig(REMOTE.replace("sslmode=require", "sslmode=disable")), /needs sslmode=require/);
  assert.throws(() => poolConfig(REMOTE.replace("?sslmode=require", "")), /needs sslmode=require/);
  assert.throws(() => poolConfig(REMOTE.replace("require", "no-verify")), /unsupported sslmode/);
  const local = poolConfig("postgres://arma_writer:pw@127.0.0.1:55433/postgres");
  assert.equal(local.ssl, undefined);
  for (const mode of ["require", "verify-ca", "verify-full"]) assert.equal(poolConfig(REMOTE.replace("require", mode)).ssl.rejectUnauthorized, true, mode);
});

test("nothing in the writer sets rejectUnauthorized false or NODE_TLS_REJECT_UNAUTHORIZED", () => {
  for (const file of ["db-config.js", "main.js", "writer.js"]) {
    const text = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/rejectUnauthorized\s*:\s*false/.test(text) && !text.includes("NODE_TLS_REJECT_UNAUTHORIZED"), file);
  }
});
