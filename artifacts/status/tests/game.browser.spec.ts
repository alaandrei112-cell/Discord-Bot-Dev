import { expect, test } from "@playwright/test";

const communityInvite = "https://discord.gg/regatulcenusii";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/moderation/session", route =>
    route.fulfill({ json: { authenticated: false } }));
  await page.route("**/api/moderation/auth-config", route =>
    route.fulfill({ json: { discordOAuthConfigured: true, authorizationUrl: "/api/moderation/oauth/discord" } }));
});

test("home opens the moderation login instead of the retired landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/moderare");
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
  await expect(page.locator(".hero-section")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
  await page.goto("/#lumea");
  await expect(page).toHaveURL("/moderare");
  await expect(page.locator(".hero-section")).toHaveCount(0);
});

test("shows the guide loading screen for at least two seconds", async ({ page }) => {
  await page.goto("/joc");
  const loadingScreen = page.getByRole("status", { name: "Se încarcă ghidul jocului" });
  await expect(loadingScreen).toBeVisible();
  await page.waitForTimeout(500);
  await expect(loadingScreen).toBeVisible();
  await expect(loadingScreen).toHaveCount(0, { timeout: 3_000 });
  await expect(page.locator("h1")).toBeVisible();
});

test("shows the Discord loading screen for at least two seconds", async ({ page }) => {
  await page.goto("/moderare");
  const loadingScreen = page.getByRole("status", { name: "Se încarcă panoul de moderare" });
  await expect(loadingScreen).toBeVisible();
  await page.waitForTimeout(500);
  await expect(loadingScreen).toBeVisible();
  await expect(loadingScreen).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
});

test("public game category is reachable and survives a direct reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
  const homeTitle = await page.title();
  await page.locator('a[href="/joc"]:visible').first().click();
  await expect(page).toHaveURL("/joc");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page).toHaveTitle(/Detalii server|Joc|Ghid/i);
  await expect(page.locator("body")).toContainText("/profil");
  await expect(page.locator("body")).toContainText("/clasa");
  await expect(page.locator("body")).toContainText("/inventar");
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator('a[href="/moderare"]:visible').first()).toBeVisible();
  await page.locator('a[href="/"]:visible').first().click();
  await expect(page).toHaveURL("/moderare");
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
  await expect(page).toHaveTitle(homeTitle);
  expect(errors).toEqual([]);
});

for (const route of ["/joc"]) {
  test(`community invitations on ${route} use the verified server link`, async ({ page }) => {
    await page.goto(route);
    const inviteLinks = page.locator('a[href^="https://discord.gg/"]');
    await expect(inviteLinks.first()).toBeAttached();
    for (const link of await inviteLinks.all()) {
      await expect(link).toHaveAttribute("href", communityInvite);
      if (await link.getAttribute("target") === "_blank") {
        await expect(link).toHaveAttribute("rel", /noopener|noreferrer/);
      }
    }
    await expect(page.locator('a[href*="JNYsGeMhzm"]')).toHaveCount(0);
  });
}

test("game category is usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
  await expect(page.locator('a[href="/joc"]:visible').first()).toBeVisible();
  await page.locator('a[href="/joc"]:visible').first().click();
  await expect(page).toHaveURL("/joc");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Deschide meniul" })).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(`a[href="${communityInvite}"]:visible`).first()).toBeVisible();
  await page.getByRole("button", { name: "Deschide meniul" }).click();
  await page.getByTestId("link-nav-home").click();
  await expect(page).toHaveURL("/moderare");
  await expect(page.getByTestId("discord-login-button")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});