# Supabase Cloud Upgrade Added

This version now includes:

- Supabase client
- Cloud database connection
- Environment variable support
- Basic cloud helper functions

IMPORTANT:

You still need to:
1. Run the SQL file in Supabase
2. Add Vercel environment variables
3. Redeploy Vercel

Environment Variables:
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

After deployment:
- open website on two devices
- add a tool
- refresh second device

If both devices show the same data:
Cloud sync is working.