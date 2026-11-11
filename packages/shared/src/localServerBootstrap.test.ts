import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { publishLocalServerBootstrap, readLocalServerBootstrap } from "./localServerBootstrap.ts";

it.effect("publishes an owner-only credential for the server lifetime", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stateDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-local-bootstrap-" });
    const destination = path.join(stateDir, "desktop-bootstrap.json");
    const secret = "0123456789abcdef0123456789abcdef";
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* publishLocalServerBootstrap(stateDir, secret);
        assert.deepEqual(JSON.parse(yield* fs.readFileString(destination)), {
          version: 1,
          pid: process.pid,
          secret,
        });
        if ((yield* HostProcess.Platform) !== "win32")
          assert.equal((yield* fs.stat(destination)).mode & 0o777, 0o600);
      }),
    );
    assert.isFalse(yield* fs.exists(destination));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect.each([
  {
    name: "live owner",
    pid: process.ppid,
    credentialPid: process.ppid,
    origin: "http://127.0.0.1:18789",
    expected: true,
  },
  {
    name: "replaced owner",
    pid: process.ppid,
    credentialPid: process.pid,
    origin: "http://127.0.0.1:18789",
    expected: false,
  },
  {
    name: "dead owner",
    pid: 2147483647,
    credentialPid: 2147483647,
    origin: "http://127.0.0.1:18789",
    expected: false,
  },
  {
    name: "own process",
    pid: process.pid,
    credentialPid: process.pid,
    origin: "http://127.0.0.1:18789",
    expected: false,
  },
  {
    name: "malformed origin",
    pid: process.ppid,
    credentialPid: process.ppid,
    origin: "not a URL",
    expected: false,
  },
])("discovers only the current live server ($name)", (row) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stateDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-local-discovery-" });
    assert.isTrue(Option.isNone(yield* readLocalServerBootstrap(stateDir)));
    yield* fs.writeFileString(
      path.join(stateDir, "server-runtime.json"),
      JSON.stringify({ version: 1, pid: row.pid, origin: row.origin }),
    );
    yield* fs.writeFileString(
      path.join(stateDir, "desktop-bootstrap.json"),
      JSON.stringify({
        version: 1,
        pid: row.credentialPid,
        secret: "0123456789abcdef0123456789abcdef",
      }),
    );
    assert.equal(Option.isSome(yield* readLocalServerBootstrap(stateDir)), row.expected);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
