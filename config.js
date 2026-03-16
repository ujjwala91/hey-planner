// ================================================================
// Configuration — fill in your values after setting up services
// See SETUP.md for step-by-step instructions
// ================================================================
const CONFIG = {
  // 1. Supabase — create a free project at https://supabase.com
  //    Go to: Project Settings > API > Project URL and anon key
  supabaseUrl: 'https://haeuxaikeftbliyahjsu.supabase.co',         // e.g. https://abcxyz.supabase.co
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZXV4YWlrZWZ0YmxpeWFoanN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NTEyOTgsImV4cCI6MjA4OTIyNzI5OH0.Z9EAOr918juTJ_Qfle_iwMl6Ew2avJbhW6w8dvy3trI', // starts with eyJ...

  // 2. Stripe Payment Link — create at https://dashboard.stripe.com/payment-links
  //    Set price to your monthly amount, enable "collect customer information"
  stripePaymentLink: 'https://razorpay.me/@ujjwalameenamandipati', // e.g. https://buy.stripe.com/xxx

  // 3. Displayed price (update to match your Stripe product)
  proPrice: '₹99/month',

  // 4. Free tier limits
  freeListLimit: 3,
};
