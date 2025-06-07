import { withStripeflare, StripeUser, DORM } from "stripeflare";
export { DORM };

// StripeUser can be extended
export default {
  fetch: withStripeflare<StripeUser>(async (request, env, ctx) => {
    const t = Date.now();
    if (!ctx.registered || ctx.user.balance <= 0) {
      return new Response("User should pay at " + ctx.paymentLink, {
        status: 402,
        headers: { Location: ctx.paymentLink },
      });
    }
    const { charged, message } = await ctx.charge(1, false);
    const speed = Date.now() - t;
    return new Response(
      charged
        ? `Charged ${ctx.user.email} 1 cent in ${speed}ms. User balance: $${(
            ctx.user.balance / 100
          ).toFixed(2)}`
        : `Could not charge user: ${message}`,
    );
  }),
};
