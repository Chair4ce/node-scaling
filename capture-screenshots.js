const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const visualsDir = path.join(__dirname, 'visuals');
const imagesDir = path.join(__dirname, 'images');

const files = [
  { html: 'architecture-diagram.html', png: '1-architecture-diagram.png', width: 950, height: 700 },
  { html: 'performance-chart.html', png: '2-performance-chart.png', width: 1000, height: 850 },
  { html: 'flow-diagram.html', png: '3-flow-diagram.png', width: 1050, height: 850 },
  { html: 'speedup-by-complexity.html', png: '4-speedup-by-complexity.png', width: 850, height: 650 },
  { html: 'social-card.html', png: '5-social-card.png', width: 650, height: 700 },
];

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 2, // High DPI for crisp images
  });
  
  for (const file of files) {
    const page = await context.newPage();
    const htmlPath = `file://${path.join(visualsDir, file.html)}`;
    const pngPath = path.join(imagesDir, file.png);
    
    console.log(`Capturing ${file.html}...`);
    
    await page.setViewportSize({ width: file.width, height: file.height });
    await page.goto(htmlPath);
    await page.waitForTimeout(500); // Let animations settle
    
    await page.screenshot({ 
      path: pngPath,
      fullPage: false,
    });
    
    console.log(`  ✓ Saved to ${file.png}`);
    await page.close();
  }
  
  await browser.close();
  console.log('\n✅ All screenshots captured!');
}

captureScreenshots().catch(console.error);
