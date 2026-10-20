#!/usr/bin/env node
import { run } from "./main.js";

const FORCE_EXIT_AFTER_MS = 3000;

const code = await run(process.argv.slice(2), {
	env: process.env,
	stdout: (s) => process.stdout.write(s),
	stderr: (s) => process.stderr.write(s),
	isTTY: Boolean(process.stdout.isTTY),
	cwd: process.cwd(),
});

// Let the process end on its own once the event loop drains. An immediate
// process.exit() races undici closing its sockets and aborts Node on Windows
// ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", exit 127). The
// unref'd timer forces the exit only if something still holds the loop, such
// as a browser launch that outlived the render budget.
process.exitCode = code;
setTimeout(() => process.exit(code), FORCE_EXIT_AFTER_MS).unref();
