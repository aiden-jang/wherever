const { chromium } = require("@playwright/test");
const { mkdirSync } = require("node:fs");
const { resolve } = require("node:path");

const base = process.env.WHEREVER_UI_URL ?? "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname))
  throw new Error("Capture fixtures are limited to a local interface.");
const output = resolve(process.env.WHEREVER_UI_OUTPUT ?? "../../docs/ui-qa/captures");
const cases = [
  "landing",
  "create",
  "join",
  "create-error",
  "name",
  "lobby",
  "filters",
  "swiping",
  "details",
  "empty-deck",
  "winner",
  "directions",
  "no-match",
  "missing",
];
const widths = [320, 390, 768, 1440];
const filters = {
  radiusMeters: 4800,
  maxPriceTier: 4,
  categories: [],
  openNow: true,
  minRating: 0,
  minReviews: 0,
};
const places = [
  {
    id: "pizza",
    name: "The Very Good Neighborhood Pizza and Pasta Kitchen",
    category: "pizza",
    imageUrl: "/teaser-pizza.jpg",
  },
  { id: "ramen", name: "Ramen, Eventually", category: "ramen", imageUrl: "/teaser-ramen.jpg" },
  { id: "tacos", name: "A Reasonable Number of Tacos", category: "tacos", imageUrl: "/teaser-tacos.jpg" },
].map((place) => ({
  ...place,
  rating: 4.7,
  reviewCount: 1248,
  priceTier: 2,
  distanceMeters: 780,
  address: "123 Very Long Neighborhood Avenue, Brooklyn, New York 11211",
  openNow: true,
  photos: [place.imageUrl, "/teaser-tacos.jpg"],
  priceRange: "$15–30",
  editorialSummary: "A comfortable neighborhood stop with room for the whole dinner committee.",
  amenities: { servesVegetarianFood: true, outdoorSeating: true, goodForGroups: true },
  hours: ["Monday: 11:00 AM – 10:00 PM", "Tuesday: 11:00 AM – 10:00 PM", "Wednesday: 11:00 AM – 10:00 PM"],
}));
const history = [
  {
    restaurantId: "past",
    name: "The Place We Agreed Never to Visit Again",
    visitedAt: "2026-09-11T18:00:00.000Z",
    neverAgain: true,
  },
];

async function setup(page, name) {
  await page.addInitScript(
    ({ named }) => {
      localStorage.setItem("wherever:muted", "1");
      if (named) sessionStorage.setItem("displayName", "Alex with a long name");
    },
    { named: !["name", "landing", "create", "join", "create-error"].includes(name) },
  );
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Couldn’t start the session right now. Try again in a moment." },
    }),
  );
  await page.routeWebSocket("**/ws/*", (socket) => {
    socket.onMessage((raw) => {
      if (JSON.parse(String(raw)).type !== "join") return;
      const send = (message) => socket.send(JSON.stringify(message));
      if (name === "missing") return send({ type: "error", message: "That session does not exist." });
      const status = ["winner", "directions", "no-match"].includes(name)
        ? "decided"
        : ["swiping", "details", "empty-deck"].includes(name)
          ? "swiping"
          : "lobby";
      send({ type: "identity", participantId: "self" });
      send({
        type: "session_state",
        session: {
          id: "ABCDEF",
          code: "ABCDEF",
          voteMode: "majority",
          status,
          filters,
          participants: [
            { id: "self", displayName: "Alex with a long name", isHost: true, connected: true },
            { id: "friend", displayName: "Sam", isHost: false, connected: true },
            { id: "another", displayName: "Someone with three names", isHost: false, connected: true },
          ],
        },
      });
      send({ type: "history", visited: history });
      if (status === "swiping") {
        send({ type: "deck", restaurants: name === "empty-deck" ? [] : places, demo: "sample" });
        send({
          type: "vote_progress",
          finishedCount: 1,
          totalParticipants: 3,
          votesCast: 4,
          tastePulse: { rightRate: 0.75, activeVoters: 3, strongestOverlap: 2, averagePriceTier: 2 },
        });
      }
      if (status === "decided") {
        send({ type: "deck", restaurants: places, demo: "sample" });
        if (name === "no-match") send({ type: "no_match", vetoedCount: 3 });
        else
          send({
            type: "match",
            restaurant: places[0],
            rightSwipes: 3,
            totalParticipants: 3,
            alternatives: [{ restaurant: places[1], rightSwipes: 2, weightedScore: 2 }],
            round: 2,
            tiedWith: 0,
          });
      }
    });
  });
  const atHome = ["landing", "create", "join", "create-error"].includes(name);
  await page.goto(new URL(atHome ? "/" : "/s/ABCDEF", base).href);
  if (["create", "create-error"].includes(name)) {
    await page.getByRole("button", { name: "Start a session", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Start a session" });
    await dialog.getByRole("textbox", { name: "Your name" }).fill("Alex");
    if (name === "create-error") {
      await dialog.getByRole("button", { name: "Deal the cards" }).click();
      await dialog.getByRole("alert").waitFor();
    }
  }
  if (name === "join") await page.getByRole("button", { name: "Join with a code" }).click();
  if (name === "filters") {
    await page.getByRole("button", { name: /Edit dinner filters/ }).click();
    await page.getByRole("button", { name: /House rules/ }).click();
  }
  if (name === "details") await page.locator("[data-card-info]").click();
  if (name === "directions")
    await page
      .getByRole("button", { name: /directions/i })
      .first()
      .click();
  const heading = atHome
    ? /Big appetites/
    : name === "name"
      ? "And you are?"
      : name === "missing"
        ? "This code leads nowhere."
        : name === "empty-deck"
          ? "Nothing survived the filters."
          : name === "no-match"
            ? "Everything got vetoed."
            : ["winner", "directions"].includes(name)
              ? /Dinner is handled/
              : ["swiping", "details"].includes(name)
                ? "Swiping. Vote on tonight's places."
                : /Waiting to start/;
  const ready = page.getByRole("heading", { name: heading });
  await ready.waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function run() {
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const name of cases) {
      if (process.env.WHEREVER_UI_CASE && name !== process.env.WHEREVER_UI_CASE) continue;
      for (const width of widths) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          serviceWorkers: "block",
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
          await setup(page, name);
          await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
          const violations = await page.evaluate(
            async () =>
              (await window.axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }))
                .violations,
          );
          if (violations.length) throw new Error(`${name} ${width}: ${JSON.stringify(violations)}`);
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
            throw new Error(`${name} ${width}: horizontal overflow`);
          if (errors.length) throw new Error(`${name} ${width}: ${errors.join(", ")}`);
          await page.screenshot({
            path: resolve(output, `${name}-${width}.png`),
            fullPage: true,
            animations: "disabled",
          });
          process.stdout.write(`Reviewed ${name} at ${width}\n`);
        } finally {
          await context.close();
        }
      }
    }
    process.stdout.write("Visual and automated accessibility checks passed.\n");
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
