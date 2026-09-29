import { expect, test } from "@playwright/test";

test("landing carries the supplied visual structure and assets", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[href="/styles/styles.css"]')).toHaveCount(1);
  await expect(
    page.locator(".hero__container .hero__image-wrapper img"),
  ).toHaveAttribute("src", "/assets/jobtrackr-hero-picture.webp");
  expect(
    await page
      .locator(".hero__image-wrapper img")
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  expect(
    await page
      .locator(".hero__heading")
      .evaluate((heading) => getComputedStyle(heading).fontFamily),
  ).toContain("Nunito");
  expect(
    await page
      .locator("body")
      .evaluate((body) => getComputedStyle(body).fontFamily),
  ).toContain("Inter");
  await expect(page.locator(".problem__container .problem__card")).toHaveCount(
    3,
  );
  await expect(page.locator(".problem__card video")).toHaveCount(3);
  await expect(
    page.locator(".features__container .feature-card__image-wrapper img"),
  ).toHaveCount(3);
  await expect(page.locator(".pricing-card__article")).toBeVisible();
  await expect(page.locator(".contact-form__wrapper")).toHaveCount(0);
});

test("visitor sees the weekly offer and can reach support and policy pages", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your job search. Organized.",
  );
  const pricing = page.locator("#pricing-section");
  await expect(pricing).toContainText("€10.99");
  await expect(pricing).toContainText("per week");
  await expect(pricing).toContainText("recurring");
  await expect(pricing).toContainText("applicable tax included");
  await expect(pricing).toContainText(
    "Unlimited CV Generation during paid access",
  );
  await expect(pricing).toContainText("20 saved Generated CVs per Application");
  await expect(pricing).not.toContainText("USD");
  await expect(
    pricing.getByRole("link", { name: "Subscribe" }),
  ).toHaveAttribute("href", "https://app.jobtrakcr.com/subscribe");
  await expect(pricing.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "https://app.jobtrakcr.com/auth/login",
  );
  await expect(page.locator("main")).not.toContainText(
    /reviews|customers served/i,
  );
  await expect(page.locator("main form")).toHaveCount(0);
  await expect(page.locator("#faq-section .faq__question-group")).toHaveCount(
    7,
  );
  await page.locator("#faq-section dt").first().click();
  await expect(page.locator("#faq-section dt").first()).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.locator("#faq-section dd").first()).toBeVisible();
  await expect(
    page.locator("footer").getByRole("link", { name: "support@jobtrakcr.com" }),
  ).toHaveAttribute("href", "mailto:support@jobtrakcr.com");

  for (const [name, path] of [
    ["Terms", "/terms/"],
    ["Privacy", "/privacy/"],
    ["Cancellation and Refund", "/cancellation-refund/"],
  ] as const) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/");
  }
});

test("public demo region follows the hero and navigation works on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator("#home-section + #demo-section")).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("navigation", { name: "Mobile" })
    .getByRole("link", { name: "Pricing" })
    .click();
  await expect(page).toHaveURL(/#pricing-section$/);
  await expect(page.locator("#pricing-section")).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
