// Memory probe over the Node inspector, for a server that has no /api/mem route.
// Start the server with NODE_OPTIONS=--inspect=<port>, then:
//
//   node scripts/probe.mjs mem [inspectorUrl]                 forced full GC, then process.memoryUsage()
//   node scripts/probe.mjs snapshot <file> [inspectorUrl]     forced full GC, then a .heapsnapshot written to <file>
//
// inspectorUrl defaults to http://127.0.0.1:9230.
import { connect } from "./inspector.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const target = await connect((cmd === "snapshot" ? rest[1] : rest[0]) ?? undefined);
if (cmd === "mem") console.log(JSON.stringify(await target.mem()));
else if (cmd === "snapshot") console.log(await target.snapshot(rest[0]));
else {
  console.error("usage: probe.mjs mem [inspectorUrl] | snapshot <file> [inspectorUrl]");
  process.exit(2);
}
target.close();
