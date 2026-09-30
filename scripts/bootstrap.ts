import { bootstrapToken } from "../lib/bootstrap";
const mint = process.argv[2];
if (!mint) { console.error("usage: npm run bootstrap -- <MINT>"); process.exit(1); }
bootstrapToken(mint).then(r => console.log("OK", r));
