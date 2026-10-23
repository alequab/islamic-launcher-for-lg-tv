# Changelog

## [Unreleased]

### Added
- Home as on Android: four favourites, a More row of five apps and an All apps tile with the count, in place of
  the radio card. Radio and network pills join Live in the header; the radio card opens from its pill.
- All apps: five columns, three rows in view, the next prayer's chip, and an info bar with the focused app and its
  place in favourites. Hold OK to arrange favourites.
- App icons: the boot script copies them into the launcher's folder, at boot and whenever an app comes or goes.
  An app without one shows its first letter. Night mode dims them.
- Live TV, HDMI 1 and 2 and the TV's Settings in the app list; Arabic names for the TV's own apps.
- The boot script gives the launcher its permissions (apps, network, Afnon's service), opens it when the TV turns
  on, and makes it the TV's last input as it turns off, so the TV starts on Afnon instead of HDMI.
- `tools/install-tv.ps1`: package, install over Homebrew Channel's telnet, put the boot script in place.

### Changed
- No grey loading screen when the launcher opens (`spinnerOnLaunch`, `noSplashOnLaunch`), and the first screen
  waits 1.5 s at most for its fonts.
- Back on Home no longer closes Afnon: it is the Home screen.
- Arabic letters that drop below the line are no longer cut off in one-line names and titles.
