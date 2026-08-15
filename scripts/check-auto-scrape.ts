import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';

app.whenReady().then(() => {
  const dbPath = 'C:/Users/8marc/AppData/Roaming/insider-whale-terminal/insider-tracker.db';
  console.log('Opening database at:', dbPath);
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    console.log('\n--- APP SETTINGS ---');
    const settings = db.prepare("SELECT * FROM app_settings").all();
    console.log(settings);

    console.log('\n--- SCRAPE LOGS (Last 10) ---');
    const logs = db.prepare("SELECT * FROM scrape_log ORDER BY id DESC LIMIT 10").all();
    logs.forEach(l => {
      console.log(`ID: ${l.id} | Started: ${l.started_at} | Finished: ${l.finished_at} | Status: ${l.status} | Signals: ${l.signals_found} | VIX: ${l.vix_at_scrape}`);
      console.log(`  Sources: ${l.sources_scraped}`);
      console.log(`  Breakdown: ${l.source_breakdown}`);
    });
    
    db.close();
  } catch (err) {
    console.error('Error:', err);
  }
  
  app.exit(0);
});
