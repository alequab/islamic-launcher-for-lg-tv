# Changelog

## [Unreleased]

### Added
- **Settings → Adjust the times** («تعديل المواقيت», its own section), as in meypod/al-azan: Fajr, Sunrise,
  Dhuhr, Asr, Maghrib and Isha each on a row with − and + round the minutes («+2», «0», «-3»), up to 30 earlier
  or later, with today's adjusted time under the name. Home, Prayer day, the reminders and the adhan all use the
  adjusted times (the service gets them with the other settings).
- **Settings keys, as the TCL build's fix:** the arrows only move (▲▼ through sections or rows, toward the start
  back to the sections). OK is the only key that changes anything: a list opens, a switch flips, or a choice or
  a stepper starts editing with a ring round it; then ◀▶ move an unsaved draft, OK saves and Back cancels.
  «✓ تم الحفظ» shows at the end of the hint line for 2 s after each save.
- **The Magic Remote's pointer works:** the cursor was hidden by the page's style. Hovering focuses, clicking is
  OK; in Settings − and + and a choice's options act at once; with the radio card open only its buttons respond.
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
- **The call to prayer opens in the launcher,** not in the Afnon app, so the launcher's own adhan voice and call
  settings are used. Afnon's service opens whichever app names itself to it (the launcher does on every message).
  When the call closes, the TV goes back to what was on screen (an HDMI input, YouTube…): the service notes it,
  with a permission the boot script grants. The launcher never closes itself after a call.
- The project is called **Islamic Launcher for LG TV** (the app's title on the TV too); it is built on Afnon.
- No grey loading screen when the launcher opens (`spinnerOnLaunch`, `noSplashOnLaunch`), and the first screen
  waits 1.5 s at most for its fonts.
- Back on Home no longer closes Afnon: it is the Home screen.
- The Hijri date turns at Maghrib, as the Islamic day does: from Maghrib to midnight it shows the next day's date,
  and its weekday with it (Friday evening reads السبت). The weekday moved from the Gregorian line to the Hijri
  one (Home, Prayer day, the dim screen). Ramadan follows the Hijri day, so its first night shows the suhoor and
  the night of Eid doesn't; «سورة الكهف اليوم» shows from Thursday's Maghrib to Friday's. Jumu'ah still replaces
  Dhuhr on the calendar Friday.
- Two more adhan voices: «المسجد النبوي» and «راغب مصطفى غلوش», the recordings meypod/al-azan uses (copy
  `app/sounds` from Afnon for LG webOS after its `tools\fetch-adhans.ps1`, as for the others).
- Umm al-Qura (the Saudi cities): Isha is 2 hours after Maghrib in Ramadan instead of 1½, from the first night of
  Ramadan to the last, as Saudi Arabia's calendar and meypod/al-azan have it. Checked against al-azan's setup of
  the same library for every city over a year.
- Cities above 48° (London, Birmingham, Manchester, Paris, Berlin, Frankfurt, Amsterdam, Brussels, Vienna): where
  summer nights never get dark enough for Fajr's and Isha's angles, they are now a seventh of the night from
  Maghrib and before sunrise, as al-azan has it (London, 21 June: Isha 22:25 and Fajr 03:40, both 01:02 before).
  All cities now match al-azan's times all year, except the Singapore method's, which round to the nearest minute
  as the Android app does (al-azan rounds up).
- The radio card's buttons stay on one row: Screen off no longer jumps below the others when a station is
  picked or the radio starts or stops.
- Arabic letters that drop below the line are no longer cut off in one-line names and titles.
