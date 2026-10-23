<div dir="rtl">

بسم الله الرحمن الرحيم

والصلاة والسلام على رسول الله، أما بعد:

# Islamic Launcher: الشاشة الرئيسية الإسلامية لتلفاز LG

مبني على أفنون، ويجعله الشاشةَ الرئيسية لتلفاز LG، كما في نسخة أندرويد: يفتح وحده عند تشغيل التلفاز قبل أي مدخل HDMI، وفيه
الصلاة القادمة والعدّ التنازلي في المحراب ومواقيت اليوم، ثم تطبيقاتك المفضلة والمزيد وكل التطبيقات.

> **أفنون من إنشاء [egyjs](https://github.com/egyjs)**:
> [egyjs/afnon-android-tv-launcher](https://github.com/egyjs/afnon-android-tv-launcher). التصميم والمزايا كلها منه،
> وهذا المستودع ينقلها إلى تلفازات LG بالرخصة نفسها (MIT). شكرًا لـ egyjs.

يعمل على تلفازات LG بنظام webOS 5 فأحدث، **بعد الروت** (Homebrew Channel).

## المزايا

- **يفتح أولًا عند تشغيل التلفاز**، وبعد كل إطفاء وتشغيل، لا مدخل HDMI ولا البث التلفزيوني قبله.
- **المفضلة:** أربعة تطبيقات كبيرة على الرئيسية، و**المزيد:** خمسة أخرى، ثم **كل التطبيقات**.
- **كل التطبيقات:** كل تطبيق بأيقونته، مع التلفاز ومدخلَي HDMI والإعدادات. اضغط مطولًا على OK لترتيب المفضلة.
- **الإذاعة والشبكة في الأعلى:** زر الإذاعة يفتح بطاقتها (تشغيل، المحطة، إطفاء الشاشة)، وزر الشبكة باسمها يفتح إعداداتها.
- **الوضع الليلي** يخفّت أيقونات التطبيقات أيضًا.
- وكل ما في [أفنون لتلفاز LG](https://github.com/alequab/afnon-webos): الأذان في وقته، والتنبيهات، والقبلة، والجمعة
  ورمضان، وإذاعات القرآن الكريم، والبث المباشر من مكة المكرمة والمدينة المنورة.

## التثبيت

الخطوات والأوامر في قسم **Install** بالإنجليزية أدناه.

</div>

---

# Islamic Launcher for LG webOS

Built on Afnon: Afnon as the Home screen of an LG TV, as on Android: it opens by itself when the TV turns on, before any HDMI
input, with the next prayer and its countdown in the mihrab arch, today's times, then your favourite apps, more
apps and All apps.

> **Afnon was created by [egyjs](https://github.com/egyjs)**:
> [egyjs/afnon-android-tv-launcher](https://github.com/egyjs/afnon-android-tv-launcher). The design and the
> features all come from egyjs's Afnon; this repository brings them to LG TVs under the same MIT licence.

Works on LG TVs with webOS 5 or newer, **rooted** with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel).

## Features

- **First on screen** when the TV turns on (from standby or a full restart), with no HDMI input or Live TV before it.
- **Favourites:** four large tiles on Home. **More:** five more apps, then **All apps** with the count.
- **All apps:** every app with its icon, plus Live TV, the HDMI inputs and the TV's Settings. Hold **OK** on an
  app to arrange favourites: move one earlier or later, or put any app in a favourite's place.
- **Radio and network pills** at the top: Radio opens its card (Play, Station, Screen off); the network pill
  shows the Wi-Fi name and opens the TV's network settings.
- **Night mode** dims the apps' icons too.
- Everything else from [Afnon for LG webOS](https://github.com/alequab/afnon-webos): the adhan, reminders,
  the Qibla, Friday and Ramadan, Quran radio and live Makkah and Madinah.

## How it works

webOS doesn't let an app become the Home screen or list other apps, so a small boot script
(`boot/90-afnon-launcher`, run by Homebrew Channel at every boot) does what the app can't:

1. Gives the launcher the permissions to list and open apps, read the network name and use Afnon's service.
2. Copies each app's icon into the launcher's folder (the TV doesn't let a web app read other apps' folders),
   again whenever an app is installed or removed.
3. Opens Afnon when the TV turns on, and makes it the TV's "last input" as it turns off, so the TV starts on
   Afnon. If an HDMI input was on screen when the TV went off, it shows for about a second first.

The Home button still opens LG's own Home bar.

## Install

You need:

- An LG TV with webOS 5 or newer, rooted, with Homebrew Channel and its root telnet on (the default).
- [Afnon for LG webOS](https://github.com/alequab/afnon-webos) installed first: its service schedules the adhan
  and reminders while the launcher is closed.
- A Windows PC on the same network with [Node.js](https://nodejs.org) and LG's tools: `npm install -g @webos-tools/cli`.

Then, from this folder:

1. Copy `app/sounds` from your Afnon for LG webOS folder (after its `tools\fetch-adhans.ps1`), or the adhan is silent.
2. Package and install it, with the boot script:
   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\install-tv.ps1 -Tv <TV IP>
   ```
   The TV downloads the package from your PC; Windows may ask once to let Node through its firewall.

To remove it: delete `/var/lib/webosbrew/init.d/90-afnon-launcher` on the TV and uninstall **Islamic Launcher**.

## Credits

The same as [Afnon for LG webOS](https://github.com/alequab/afnon-webos): see [THIRD_PARTY.md](THIRD_PARTY.md).
Released under the [MIT licence](LICENSE).
