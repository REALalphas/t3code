import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const LocalServerBootstrap = Schema.Struct({
  version: Schema.Literal(1),
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  secret: Schema.String.check(Schema.isMinLength(1)),
});

const LocalServerRuntime = Schema.Struct({
  version: Schema.Literal(1),
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  origin: Schema.URLFromString,
});

const encodeBootstrap = Schema.encodeEffect(Schema.fromJsonString(LocalServerBootstrap));
const decodeBootstrap = Schema.decodeUnknownEffect(Schema.fromJsonString(LocalServerBootstrap));
const decodeRuntime = Schema.decodeUnknownEffect(Schema.fromJsonString(LocalServerRuntime));

export const publishLocalServerBootstrap = Effect.fn("localServerBootstrap.publish")(function* (
  stateDir: string,
  secret: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const destination = path.join(stateDir, "desktop-bootstrap.json");
  const temporaryDirectory = yield* fs.makeTempDirectoryScoped({
    directory: stateDir,
    prefix: "desktop-bootstrap-",
  });
  const temporary = path.join(temporaryDirectory, "credential");
  const contents = yield* encodeBootstrap({
    version: 1,
    pid: process.pid,
    secret,
  });
  yield* Effect.acquireRelease(
    fs
      .writeFileString(temporary, contents, {
        mode: 0o600,
        flag: "wx",
      })
      .pipe(Effect.andThen(fs.rename(temporary, destination))),
    () => fs.remove(destination, { force: true }).pipe(Effect.ignore({ log: true })),
  );
});

export const readLocalServerBootstrap = Effect.fn("localServerBootstrap.read")(function* (
  stateDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* Effect.gen(function* () {
    const runtime = yield* fs
      .readFileString(path.join(stateDir, "server-runtime.json"))
      .pipe(Effect.flatMap(decodeRuntime));
    const bootstrap = yield* fs
      .readFileString(path.join(stateDir, "desktop-bootstrap.json"))
      .pipe(Effect.flatMap(decodeBootstrap));
    if (runtime.pid !== bootstrap.pid || runtime.pid === process.pid) return Option.none();
    const alive = yield* Effect.sync(() => {
      try {
        process.kill(runtime.pid, 0);
        return true;
      } catch (error) {
        return error instanceof Error && "code" in error && error.code === "EPERM";
      }
    });
    if (!alive || runtime.origin.protocol !== "http:") return Option.none();
    return Option.some({
      httpBaseUrl: runtime.origin,
      secret: bootstrap.secret,
      pid: runtime.pid,
    });
  }).pipe(Effect.orElseSucceed(() => Option.none()));
});
