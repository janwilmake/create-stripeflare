import { withStripeflare, StripeUser, DORM } from "stripeflare";
export { DORM };

// StripeUser can be extended
export default withStripeflare<StripeUser>({
  // customMigrations: optional way to overwrite default user table with an extension to your database
  // version: "1" // resets data
  handler: {
    async fetch(request, env, ctx): Promise<Response> {
      const t = Date.now();
      const { charged, message } = await ctx.charge(1, false);
      const speed = Date.now() - t;
      return new Response(
        charged
          ? `Charged ${ctx.user.name} 1 cent in ${speed}ms`
          : `Could not charge user in ${speed}ms`,
      );
    },
  },
});
