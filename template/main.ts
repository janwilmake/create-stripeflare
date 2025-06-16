import { withStripeflare, StripeUser, DORM } from "stripeflare";
export { DORM };

type Env = {};
// StripeUser can be extended
export default {
  fetch: withStripeflare<Env, StripeUser>(async (request, env, ctx) => {
    if (!ctx.registered || ctx.user.balance < 1) {
      return new Response("User should pay at " + ctx.paymentLink, {
        status: 402,
      });
    }
    const newBalance = ((ctx.user.balance - 1) / 100).toFixed(2);
    return new Response(
      `Charging ${ctx.user.email} 1 cent.\n\nNew User balance: $${newBalance}`,
      { headers: { "X-Price": "1" } },
    );
  }),
};
