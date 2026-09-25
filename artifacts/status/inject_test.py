import sys

file_path = "src/pages/moderation/moderation.css"
with open("tests/moderation.browser.spec.ts", "r") as f:
    content = f.read()

injection = """
  test("Take visual regression screenshots", async ({ page }) => {
    await page.goto("/moderare");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('[data-testid="button-select-guild-111111111"]');
    await page.click('[data-testid="button-select-guild-111111111"]');
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.screenshot({ path: '/tmp/desktop_dashboard.png', fullPage: true });
    
    await page.goto("/moderare/config");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/desktop_config.png', fullPage: true });
    
    await page.goto("/moderare/bot?tab=channels");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/desktop_botcontrol.png', fullPage: true });
    
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/moderare");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/mobile_dashboard.png', fullPage: true });
  });
"""

if 'Take visual regression screenshots' not in content:
    content = content.replace('test.beforeEach(async ({ page }) => {', injection + '\n  test.beforeEach(async ({ page }) => {')
    with open("tests/moderation.browser.spec.ts", "w") as f:
        f.write(content)
