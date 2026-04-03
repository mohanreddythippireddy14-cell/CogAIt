export default {
  providers: [
    {
      // Support both server-style and Vite-prefixed env names.
      domain: process.env.CONVEX_SITE_URL ?? process.env.VITE_CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
