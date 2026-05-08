
# Real Shop Setup

1. Create a Supabase project.
2. Run `supabase-real-shop.sql` in the Supabase SQL Editor.
3. Create a private Supabase Storage bucket named `reports`.
4. Create `.env.local` from `.env.local.example`.
5. Create users in Supabase Auth.
6. Add matching rows in `app_users`.
7. Deploy to Vercel.

Roles:
- admin
- supervisor
- tech
- auditor

This is the real-shop foundation:
- cloud database schema
- row-level security
- audit tables
- report archive table
- scanner history table
- toolbox return approval fields
- consumable usage tracking by unit
