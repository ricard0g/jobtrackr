import { expect, test } from "@playwright/test";

test("paid Buyer is directed to the registration email as the only next step", async ({
  page,
}) => {
  await page.route("**/api/v1/billing/checkouts/status", (route) =>
    route.fulfill({
      json: {
        registrationEligible: true,
        paidPeriodStart: "2099-10-01T00:00:00Z",
        expiresAt: "2099-10-08T00:00:00Z",
      },
    }),
  );
  let checkoutToken: string | null = null;
  await page.route("**/api/v1/auth/registration/verification", (route) => {
    checkoutToken = route.request().headers()["x-checkout-token"];
    return route.fulfill({ status: 202 });
  });
  await page.goto("/checkout-return/#checkout-token");

  await expect(page.getByText("Payment confirmed")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "One more step: get your registration email",
    }),
  ).toBeVisible();
  const send = page.getByRole("button", { name: "Send my registration email" });
  await expect(send).toBeVisible();
  await expect(send).toHaveCSS("border-top-width", "0px");
  await expect(page.locator("main a:visible")).toHaveText(["support@jobtrakcr.com"]);
  await expect(page).toHaveURL(/\/checkout-return\/$/);

  await send.click();

  await expect(page.getByText(/Email sent\. Open the link/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resend registration email" }),
  ).toBeVisible();
  expect(checkoutToken).toBe("checkout-token");
});

test("ended paid week explains that a new purchase is required", async ({
  page,
}) => {
  await page.route("**/api/v1/billing/checkouts/status", (route) =>
    route.fulfill({
      json: {
        registrationEligible: false,
        paidPeriodStart: "2020-10-01T00:00:00Z",
        expiresAt: "2020-10-08T00:00:00Z",
      },
    }),
  );
  await page.goto("/checkout-return/#checkout-token");

  await expect(
    page.getByRole("heading", { level: 1, name: "This paid week has ended" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send my registration email" }),
  ).toBeHidden();
});

test("duplicate purchase explains the automatic refund and offers sign in", async ({
  page,
}) => {
  await page.route("**/api/v1/billing/checkouts/status", (route) =>
    route.fulfill({
      json: {
        registrationEligible: false,
        paidPeriodStart: null,
        expiresAt: null,
        duplicate: true,
      },
    }),
  );
  await page.goto("/checkout-return/#checkout-token");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "You already have a JobTrackr subscription",
    }),
  ).toBeVisible();
  await expect(page.getByText(/refunded automatically/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in to JobTrackr" }),
  ).toHaveAttribute("href", "https://app.jobtrakcr.com/auth/login");
  await expect(
    page.getByRole("button", { name: "Send my registration email" }),
  ).toBeHidden();
  await expect(page.getByText("Checking your payment")).toBeHidden();
});
