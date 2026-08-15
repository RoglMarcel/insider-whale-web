import { chromium } from 'playwright';
import { fetchValuation } from '../electron/scraper/valuation';

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 }
  });
  try {
    console.log('Fetching SMMT valuation...');
    const result = await fetchValuation(context, 'SMMT');
    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

main();
