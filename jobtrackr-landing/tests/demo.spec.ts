import { expect, test, type Locator, type Page } from "@playwright/test";

const column = (page: Page, label: string) =>
  page.getByRole("region", { name: `${label} column` });

const card = (scope: Locator, company: string) =>
  scope.getByRole("button", { name: new RegExp(`^${company},`) });

async function dragTo(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Drag source or target is not visible");

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 12,
    from.y + from.height / 2,
    {
      steps: 4,
    },
  );
  await page.mouse.move(to.x + to.width / 2, to.y + 90, { steps: 16 });
  await page.mouse.up();
}

test("public demo is framed in the hero behind a decorative browser bar", async ({
  page,
}) => {
  await page.goto("/");

  const figure = page.locator(
    "#home-section .hero__image-wrapper #demo-section",
  );
  const iframe = figure.locator('iframe[src="/demo"]');
  await expect(iframe).toHaveAttribute("title", "JobTrackr Public Demo");
  await iframe.scrollIntoViewIfNeeded();
  await expect(iframe).toBeVisible();

  const bar = figure.locator(".demo__browser-bar");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await expect(bar.locator(".demo__dots i")).toHaveCount(3);
  await expect(bar.locator(".demo__address")).toHaveText("jobtrakcr.com/demo");
  const barBox = await bar.boundingBox();
  const iframeBox = await iframe.boundingBox();
  expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(iframeBox!.y + 1);

  const frame = page.frameLocator("#demo-section iframe");
  await card(frame.locator("body"), "Northwind Labs").click();
  await expect(
    frame.getByRole("dialog", { name: "Senior Frontend Engineer" }),
  ).toBeVisible();
});

test("visitor moves fictional cards temporarily and reload restores the board", async ({
  page,
}) => {
  await page.goto("/demo");

  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", {
        name: "Kanban",
      }),
  ).toHaveAttribute("aria-current", "page");
  for (const label of [
    "Applied",
    "In Review",
    "Interview",
    "Offer",
    "Rejected",
    "Withdrawn",
  ]) {
    await expect(column(page, label)).toBeVisible();
  }

  const quanta = card(column(page, "Applied"), "Quanta Freight");
  await expect(quanta).toBeVisible();

  await dragTo(page, quanta, column(page, "In Review"));

  await expect(card(column(page, "In Review"), "Quanta Freight")).toBeVisible();
  await expect(card(column(page, "Applied"), "Quanta Freight")).toHaveCount(0);

  await page.reload();

  await expect(card(column(page, "Applied"), "Quanta Freight")).toBeVisible();
  await expect(card(column(page, "In Review"), "Quanta Freight")).toHaveCount(
    0,
  );
});

test("visitor inspects Application details and prepared CV Generation history", async ({
  page,
}) => {
  await page.goto("/demo");

  await card(column(page, "Interview"), "Northwind Labs").click();
  const dialog = page.getByRole("dialog", { name: "Senior Frontend Engineer" });
  await expect(dialog).toContainText("Northwind Labs");
  await expect(dialog).toContainText("Interview");
  await expect(dialog).toContainText("EUR 55k - 68k");
  await expect(dialog).toContainText("Lisbon, Portugal");
  await expect(dialog).toContainText("Hybrid");
  await expect(
    dialog.getByRole("heading", { name: "Interviews" }),
  ).toBeVisible();
  await expect(dialog).toContainText("Technical");

  await dialog.getByRole("tab", { name: "CV Generations" }).click();
  const history = dialog.getByRole("list", { name: "CV Generation history" });
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(history).toContainText("Completed");
  await expect(history).toContainText("Failed");
  const generatedCvs = dialog.getByRole("list", { name: "Generated CVs" });
  await expect(generatedCvs).toContainText("v2");
  await expect(generatedCvs).toContainText("v1");

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);

  await card(column(page, "Applied"), "Quanta Freight").click();
  const emptyDialog = page.getByRole("dialog", {
    name: "Logistics Data Analyst",
  });
  await emptyDialog.getByRole("tab", { name: "CV Generations" }).click();
  await expect(emptyDialog).toContainText(
    "No CV Generations yet for this Application.",
  );
  await page.keyboard.press("Escape");
  await expect(emptyDialog).toHaveCount(0);
});

test("demo is preview-only and makes no API, auth, or persistence requests", async ({
  page,
}) => {
  const requests: { url: string; method: string; type: string }[] = [];
  page.on("request", (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      type: request.resourceType(),
    }),
  );

  await page.goto("/demo");
  await dragTo(
    page,
    card(column(page, "Applied"), "Quanta Freight"),
    column(page, "In Review"),
  );
  await card(column(page, "Interview"), "Northwind Labs").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "CV Generations" }).click();
  await expect(
    dialog.getByRole("list", { name: "Generated CVs" }),
  ).toBeVisible();

  const demo = page.getByTestId("public-demo");
  const controls = demo.getByRole("button", {
    name: /add|create|new|edit|delete|upload|download|generate|save/i,
  });
  await expect(controls).toHaveCount(0);
  await expect(demo.locator("form, input, textarea, select")).toHaveCount(0);
  await expect(demo.getByRole("link")).toHaveCount(0);

  expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  expect(
    requests.filter((request) =>
      /\/(api|auth|oauth2|login|subscribe)\b/.test(
        new URL(request.url).pathname,
      ),
    ),
  ).toEqual([]);
  expect(
    requests.filter(
      (request) =>
        (request.type === "fetch" || request.type === "xhr") &&
        !new URL(request.url).pathname.startsWith("/@"),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
    })),
  ).toEqual({ local: 0, session: 0, cookie: "" });
});
