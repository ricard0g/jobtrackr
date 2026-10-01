import { expect, test } from "@playwright/test";

async function paidCheckout(page: import("@playwright/test").Page, google: boolean) {
  await page.route("**/api/v1/billing/checkouts/status", (route) =>
    route.fulfill({
      json: {
        registrationEligible: true,
        paidPeriodStart: "2099-10-01T00:00:00Z",
        expiresAt: "2099-10-08T00:00:00Z",
      },
    }),
  );
  await page.route("**/api/v1/auth/providers", (route) =>
    route.fulfill({ json: { google } }),
  );
  await page.goto("/checkout-return/#checkout-token");
}

test("paid Buyer can continue to Google registration with the Checkout token", async ({
  page,
}) => {
  await paidCheckout(page, true);

  await expect(
    page.getByRole("button", { name: "Send my registration email" }),
  ).toBeVisible();
  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute(
    "href",
    /\/auth\/register#checkout=checkout-token$/,
  );
  await expect(page).toHaveURL(/\/checkout-return\/$/);
});

test("Google registration stays hidden while Google Sign-In is disabled", async ({
  page,
}) => {
  await paidCheckout(page, false);

  await expect(
    page.getByRole("button", { name: "Send my registration email" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue with Google" }),
  ).toBeHidden();
});
