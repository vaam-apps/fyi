import { defineMd3Config } from "@vaam-apps/vitepress-md3/config";

// Published to the gh-pages branch by .github/workflows/docs.yml and served
// by GitHub Pages at https://vaam-apps.github.io/fyi/. DOCS_BASE overrides
// the path (`||`, not `??`: an empty value means "use the default").
const base = process.env.DOCS_BASE || "/fyi/";
const repo = "https://github.com/vaam-apps/fyi";

export default defineMd3Config({
  base,
  lang: "en",
  title: "vym.fyi",
  titleTemplate: ":title · vym.fyi",
  description:
    "A tiny, API-only, multi-tenant URL shortener written in Rust.",
  cleanUrls: true,
  lastUpdated: true,
  // A link to a page that does not exist fails the build.
  ignoreDeadLinks: false,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: `${base}logo.svg` }]],

  themeConfig: {
    md3: {
      style: "expressive",
      seed: "#0b7285",
    },

    logo: "/logo.svg",

    nav: [
      { text: "Developer guide", link: "/README" },
      { text: "Architecture", link: "/arc42" },
      { text: "All vaam-apps docs", link: "https://vaam-apps.github.io/vitepress-md3/projects/" },
    ],

    sidebar: [
      {
        text: "vym.fyi",
        items: [
          { text: "Overview", link: "/" },
          { text: "Developer guide", link: "/README" },
          { text: "Architecture (arc42)", link: "/arc42" },
        ],
      },
    ],

    outline: { level: [2, 3] },
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
    },
  },
});
