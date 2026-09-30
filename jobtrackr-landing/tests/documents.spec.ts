import { expect, test } from "@playwright/test";

test("Documents mirrors the app's tabs, recent files, and sortable library", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Generated CVs", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const recent = page.getByRole("region", { name: "Recent files" });
  await expect(recent.getByRole("button")).toHaveCount(5);
  const table = page.getByRole("table", { name: "Generated CVs" });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Name",
    "Type",
    "Size",
    "Created",
    "Version",
    "Company",
    "Actions",
  ]);
  await expect(table.getByRole("row")).toHaveCount(6);
  await expect(
    table.getByRole("row").filter({ hasText: "application-3-cv-v1" }),
  ).toContainText("Brightline Health");
  await table.getByRole("button", { name: "Name", exact: true }).click();
  await expect(
    table.getByRole("columnheader", { name: "Name", exact: true }),
  ).toHaveAttribute("aria-sort", "ascending");
  await expect(table.getByRole("row").nth(1)).toContainText(
    "application-2-cv-v1",
  );
  await expect(
    page.getByRole("button", { name: "Previous page", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Base CVs", exact: true }).click();
  await expect(page.getByRole("table", { name: "Base CVs" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No Base CVs yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /\b(upload|download|generate|create|delete)\b/i,
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Kanban", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 375, height: 667 },
]) {
  test(`supplied PDF renders with zoom and fit controls at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const requests: { url: string; method: string }[] = [];
    page.on("request", (request) =>
      requests.push({ url: request.url(), method: request.method() }),
    );
    await page.goto("/demo");
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    const previewButton = page.getByRole("button", {
      name:
        viewport.width >= 768
          ? "Preview application-3-cv-v1.pdf"
          : "Preview application-3-cv-v1.pdf from Recent files",
      exact: true,
    });
    await previewButton.click();
    const dialog = page.getByRole("dialog", {
      name: "application-3-cv-v1.pdf",
      exact: true,
    });
    await expect(
      dialog.getByText("Daniel Marlowe", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Page 1 of 1", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Previous page", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Next page", exact: true }),
    ).toBeDisabled();
    const canvas = dialog.locator("canvas");
    await expect(canvas).toBeVisible();
    const width = () =>
      canvas.evaluate((element) => element.getBoundingClientRect().width);
    await expect.poll(width).toBeLessThan(viewport.width - 32);
    const fittedWidth = await width();
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(width).toBeGreaterThan(fittedWidth + 50);
    await dialog
      .getByRole("button", { name: "Fit to width", exact: true })
      .click();
    await expect.poll(width).toBeCloseTo(fittedWidth, 0);
    await expect(
      page.getByRole("button", {
        name: /\b(upload|download|generate|create|delete)\b/i,
      }),
    ).toHaveCount(0);
    await expect(dialog.getByRole("link")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(previewButton).toBeFocused();
    expect(
      requests.some(
        ({ url }) =>
          new URL(url).pathname === "/demo-cvs/application-3-cv-v1.pdf",
      ),
    ).toBe(true);
    expect(
      requests.filter(
        ({ url, method }) =>
          method !== "GET" ||
          /\/(api|auth|oauth2|login)\b/.test(new URL(url).pathname),
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
}

test("mobile table actions preview the PDF and open the associated Application", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/demo");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const more = page.getByRole("button", {
    name: "More actions for application-3-cv-v1.pdf on small screens",
    exact: true,
  });
  await more.click();
  await page.getByRole("menuitem", { name: "Preview", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "application-3-cv-v1.pdf",
    exact: true,
  });
  await expect(
    dialog.getByText("Daniel Marlowe", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(more).toBeFocused();
  await more.click();
  await page
    .getByRole("menuitem", { name: "Open Application", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Frontend Developer", exact: true }),
  ).toContainText("Brightline Health");
});

test("the supplied PDF loads inside the landing iframe and recovers from a failed request", async ({
  page,
}) => {
  await page.route("**/demo-cvs/application-3-cv-v1.pdf", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  const frame = page.frameLocator("#demo-section iframe");
  await frame.getByRole("button", { name: "Documents", exact: true }).click();
  await frame
    .getByRole("button", {
      name: "Preview application-3-cv-v1.pdf from Recent files",
      exact: true,
    })
    .click();
  const dialog = frame.getByRole("dialog", {
    name: "application-3-cv-v1.pdf",
    exact: true,
  });
  await expect(dialog.getByRole("alert")).toHaveText(
    "This PDF could not be rendered.",
  );
  await expect(dialog.getByRole("button", { name: /download/i })).toHaveCount(
    0,
  );
  await page.unroute("**/demo-cvs/application-3-cv-v1.pdf");
  await dialog
    .getByRole("button", { name: "Retry Preview", exact: true })
    .click();
  await expect(
    dialog.getByText("Daniel Marlowe", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator("canvas")).toBeVisible();
});
