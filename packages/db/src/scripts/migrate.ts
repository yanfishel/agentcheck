import { createDb, migrate } from "../client.ts";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const handle = createDb(url);
try {
	await migrate(handle);
	console.log("Migrations applied");
} finally {
	await handle.close();
}
