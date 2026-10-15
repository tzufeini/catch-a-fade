Free Unsplash photos (Unsplash License) for App Store screenshots.

- photo-1553521041 (B&W barber with scissors) and photo-1598524374912 (barber spraying): the "Marco" and "Jordan" favorites on the Account screenshot.
- photo-1757744705465: the "Daniel Reyes" customer avatar.
- p-*.jpg: barbers at work, for barber profile pictures (crop the barber's face) and portfolio grids.

account-demo.js is the demo state used to render store-5-account.png (headless Chrome --screenshot, window 500x956 at 3x, #phone pinned to 440px at left:30px, crop to 1320x2868).

## Regenerating the App Store screenshots
The faces, names and prices below exist only in screenshots/demo.js. They are never part of the app:
the app shows only real barbers who applied and passed the automatic review.

1. Start the "fadeprev" preview server (port 3790).
2. `screenshots/make-site.sh` copies the current app into screenshots/site/ with demo-pre.js + demo.js.
3. `node screenshots/shoot.mjs screenshots/appstore` drives an off-screen Chrome over CDP and saves
   5 PNGs at 1320x2868 (iPhone 6.9"). Headless --screenshot breaks Apple Maps (no labels/grayscale).
