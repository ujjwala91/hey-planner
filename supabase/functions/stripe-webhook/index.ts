// ================================================================
// Stripe Webhook — Supabase Edge Function
// Updates Pro status when Stripe payment succeeds/cancels
// Deploy: supabase functions deploy stripe-webhook
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//          supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// Stripe Dashboard: Add webhook URL pointing to this function
// ================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0?target=deno";

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Verify the webhook came from Stripe
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Payment completed → grant Pro
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;

      if (userId) {
        const proExpiresAt = new Date();
        proExpiresAt.setDate(proExpiresAt.getDate() + 31);

        await supabase.from("profiles").upsert({
          id: userId,
          is_pro: true,
          stripe_customer_id: session.customer as string,
          pro_expires_at: proExpiresAt.toISOString(),
        });
      }
    }

    // Subscription renewed → extend Pro
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (profile) {
        const proExpiresAt = new Date();
        proExpiresAt.setDate(proExpiresAt.getDate() + 31);

        await supabase.from("profiles").update({
          is_pro: true,
          pro_expires_at: proExpiresAt.toISOString(),
        }).eq("id", profile.id);
      }
    }

    // Subscription cancelled → revoke Pro
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (profile) {
        await supabase.from("profiles").update({
          is_pro: false,
          pro_expires_at: null,
        }).eq("id", profile.id);
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    return new Response(`Webhook error: ${error.message}`, { status: 400 });
  }
});
