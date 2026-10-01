import { ingestMarket } from '../lib/market/ingest';
ingestMarket().then(result => console.log(JSON.stringify(result))).catch(error => {
  console.error(error instanceof Error ? error.message : 'Ingestion failed'); process.exitCode=1;
});
