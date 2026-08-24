import type { MetadataRoute } from "next";

/** Added because Axiom reported it missing when we audited ourselves. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The scan endpoint drives a browser; there is nothing for a crawler here.
      disallow: "/api/",
    },
    sitemap: "https://axiom.dev/sitemap.xml",
  };
}
