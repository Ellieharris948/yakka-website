# Yakka web app

This directory contains the browser build of the Yakka product app. It uses the
same Supabase authentication, profiles, jobs, messages, payment, dispute and
admin flows as the mobile app, with web-specific responsive navigation and
login styling.

## Local setup

1. Copy `.env.example` to `.env` and add the public Supabase and Google Places
   values used by the mobile app. Never add server or service-role secrets here.
2. Install dependencies with `npm install`.
3. Run `npm run web` for development.

## Build the website copy

Run `npm run build:site`. Expo builds the app with `/app` as its public base
path, then the sync script replaces the generated website output in `../app`.

The marketing homepage routes both **Log in** and **Get started** to `/app/`.
