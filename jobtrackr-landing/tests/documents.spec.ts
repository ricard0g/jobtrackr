import { expect, test } from "@playwright/test";

test("visitor browses Documents tied to the prepared Applications", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Documents", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const table = page.getByRole("table", { name: "Generated CVs" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(6);
  const northwind = table
    .getByRole("row")
    .filter({ hasText: "alex-rivera-northwind-labs-v2.md" });
  await expect(northwind).toContainText("Northwind Labs");
  await expect(northwind).toContainText("Senior Frontend Engineer");
  await expect(northwind).toContainText("v2");
  await page.getByRole("button", { name: "Kanban", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Interview column" })
      .getByRole("button", { name: /^Northwind Labs,/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Kanban", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 375, height: 667 },
]) {
  test(`visitor previews a local fictional CV at ${viewport.width}px without write controls`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const requests: { path: string; method: string; type: string }[] = [];
    page.on("request", (request) =>
      requests.push({
        path: new URL(request.url()).pathname,
        method: request.method(),
        type: request.resourceType(),
      }),
    );
    await page.goto("/demo");
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    const row = page
      .getByRole("row")
      .filter({ hasText: "alex-rivera-cobalt-studio-v1.md" });
    await row.getByRole("button", { name: "Preview" }).click();
    const dialog = page.getByRole("dialog", {
      name: "alex-rivera-cobalt-studio-v1.md",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Alex Rivera", exact: true }),
    ).toBeVisible();
    await expect(dialog).toContainText("alex.rivera@example.test");
    for (const name of [
      "PROFESSIONAL SUMMARY",
      "EXPERIENCE",
      "EDUCATION",
      "SKILLS",
    ]) {
      await expect(
        dialog.getByRole("heading", { name, exact: true }),
      ).toHaveCount(1);
    }
    const content = dialog.getByRole("article", { name: "CV content" });
    expect(
      await content.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await expect(
      page
        .getByTestId("public-demo")
        .getByRole("button", {
          name: /upload|download|generate|create|edit|delete|save/i,
        }),
    ).toHaveCount(0);
    await expect(dialog.getByRole("link")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Preview" })).toBeFocused();
    expect(
      requests.filter(
        (request) =>
          request.method !== "GET" ||
          /\/(api|auth|oauth2|login)\b/.test(request.path),
      ),
    ).toEqual([]);
    expect(
      requests.filter(
        (request) =>
          ["fetch", "xhr"].includes(request.type) &&
          !request.path.startsWith("/@") &&
          !request.path.startsWith("/demo-cvs/"),
      ),
    ).toEqual([]);
    expect(
      requests.filter(
        (request) =>
          request.path === "/demo-cvs/alex-rivera-cobalt-studio-v1.md",
      ),
    ).toHaveLength(1);
    expect(
      await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
        cookie: document.cookie,
      })),
    ).toEqual({ local: 0, session: 0, cookie: "" });
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await expect(
      page.getByRole("table", { name: "Generated CVs" }).getByRole("row"),
    ).toHaveCount(6);
  });
}

test("all prepared CV rows open their own local preview inside the landing frame", async ({
  page,
}) => {
  await page.goto("/");
  const frame = page.frameLocator("#demo-section iframe");
  await frame.getByRole("button", { name: "Documents", exact: true }).click();
  for (const filename of [
    "alex-rivera-cobalt-studio-v1.md",
    "alex-rivera-brightline-health-v1.md",
    "alex-rivera-northwind-labs-v2.md",
    "alex-rivera-northwind-labs-v1.md",
    "alex-rivera-fernway-bank-v1.md",
  ]) {
    const response = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/demo-cvs/${filename}`,
    );
    await frame
      .getByRole("row")
      .filter({ hasText: filename })
      .getByRole("button", { name: "Preview" })
      .click();
    expect((await response).ok()).toBe(true);
    const dialog = frame.getByRole("dialog", { name: filename });
    await expect(
      dialog.getByRole("heading", { name: "Alex Rivera", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});
