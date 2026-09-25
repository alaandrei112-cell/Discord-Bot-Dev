import sys

file_path = "tests/moderation.browser.spec.ts"
with open(file_path, "r") as f:
    content = f.read()

mock_code = """
    await page.route("**/api/moderation/guilds/*/bot-control", async (route) => {
      await route.fulfill({
        json: {
          config: {
            discordLive: true,
            provisioning: {},
            channels: {},
            tickets: { categories: {}, flows: {}, activeFlows: [], allianceAnnouncementTemplate: "" },
            roleScroll: { rules: [] }
          },
          version: 1
        }
      });
    });
"""

if 'bot-control' not in content:
    content = content.replace(
        'await page.route("**/api/moderation/guilds/*/cases**", async (route) => await route.fulfill({ json: { items: [] } }));',
        mock_code.strip() + '\n    await page.route("**/api/moderation/guilds/*/cases**", async (route) => await route.fulfill({ json: { items: [] } }));'
    )
    with open(file_path, "w") as f:
        f.write(content)
