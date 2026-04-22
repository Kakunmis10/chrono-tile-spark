import { createFileRoute } from "@tanstack/react-router";

import { PatternGame } from "../components/pattern-game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pattern Game | Neon Memory Grid" },
      {
        name: "description",
        content: "A dark neon pattern memory game where players repeat glowing tile sequences and build score.",
      },
      { property: "og:title", content: "Pattern Game | Neon Memory Grid" },
      {
        property: "og:description",
        content: "Watch the grid, repeat the pattern, and score points for every correct tile.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <PatternGame />;
}
