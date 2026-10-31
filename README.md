# TaskMate 249

A responsive academic task manager built with React, Vite and Firebase.

## Features
- Google sign-in with Firebase Authentication
- User-isolated Firestore task storage
- Create, edit, complete and delete tasks
- Categories, search, deadline and progress summary
- Dark/light theme and mobile-first layout

## Local setup
1. Run `npm install`.
2. Create a Firebase project and add a Web App.
3. Enable **Authentication → Google** and create a **Cloud Firestore** database.
4. Copy `.env.example` to `.env.local` and fill in the Firebase web app values.
5. Add `localhost` and your Vercel domain to Firebase Authentication authorized domains.
6. Run `npm run dev`.

## Vercel environment variables
Set these in Project Settings → Environment Variables for Production, Preview and Development:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Redeploy after adding or changing environment variables.

## Firestore rules
Deploy the rules in `firestore.rules` from the Firebase console or Firebase CLI. Do not use open/public rules.

Google Sheets backup, Telegram notifications, Web Push and PWA/offline support are not included in this initial deployment.
