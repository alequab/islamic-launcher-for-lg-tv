/*
 * Afnon LG: every interface string in Arabic and English, from the Android app's Text.java (verbatim), plus the
 * few the LG version needs (marked "LG"). Shared by the page (window.Text) and the service (require). ES5.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Text = factory();
})(this, function () {
  'use strict';

  function Text(ar, eastern) {
    this.ar = ar;
    /** Eastern Arabic digits (٠١٢٣). Its own setting; defaults to on in Arabic. */
    this.eastern = eastern;
    this.cityName = '';
  }
  var T = Text.prototype;

  T.d = function (s) {
    s = String(s);
    if (!this.eastern) return s;
    // "·" beside Eastern digits reads as a zero (٠); Arabic punctuation takes its own comma instead.
    s = s.split(' · ').join('، ');
    return s.replace(/[0-9]/g, function (c) { return String.fromCharCode(0x0660 + (c.charCodeAt(0) - 48)); });
  };

  /** The " · " between parts of a line; a comma where "·" would sit beside Eastern digits. */
  T.sep = function () { return this.d(' · '); };

  // The verse reference follows the digits setting like every other number (Text.java wrote it in Eastern digits).
  T.ref = function () { return this.d(this.ar ? 'النساء 103' : 'An-Nisa 4:103'); };
  T.nextPrayer = function () { return this.ar ? 'الصلاة القادمة' : 'NEXT PRAYER'; };
  T.today = function () { return this.ar ? 'مواقيت اليوم والقبلة' : 'Today & Qibla'; };
  T.settings = function () { return this.ar ? 'الإعدادات' : 'Settings'; };
  T.city = function () { return this.cityName; };
  T.ampm = function (am) { return this.ar ? (am ? 'ص' : 'م') : (am ? 'AM' : 'PM'); };
  T.adhanAt = function () { return this.ar ? 'الأذان' : 'Adhan at'; };
  T.nowTag = function () { return this.ar ? 'الآن' : 'NOW'; };
  T.nextTag = function () { return this.ar ? 'التالية' : 'NEXT'; };
  T.jumuahLabel = function () { return this.ar ? 'صلاة الجمعة' : "JUMU'AH"; };
  T.jumuah = function () { return this.ar ? 'الجمعة' : "Jumu'ah"; };
  T.kahf = function () { return this.ar ? 'سورة الكهف اليوم' : 'Surat Al-Kahf today'; };
  T.iftarIn = function () { return this.ar ? 'الإفطار بعد' : 'IFTAR IN'; };
  T.iftar = function () { return this.ar ? 'الإفطار' : 'Iftar'; };
  T.iftarTag = function () { return this.ar ? 'الإفطار' : 'IFTAR'; };
  T.suhoorTag = function () { return this.ar ? 'الإمساك' : 'SUHOOR'; };
  T.suhoorEnds = function (time) { return this.d(this.ar ? 'السحور حتى ' + time : 'Suhoor ends ' + time); };

  T.hintOk = function (what) { return 'OK  ' + what; };

  /**
   * "in 27 min". Arabic counts take their proper forms: دقيقة واحدة، دقيقتين، ٣–١٠ دقائق، ١١+ دقيقة. An hour or
   * more reads as h:mm, as on Prayer day.
   */
  T.inMinutes = function (minutes, hoursAndMinutes) {
    if (minutes >= 60) return this.in(hoursAndMinutes);
    if (!this.ar) return this.d('in ' + minutes + ' min');
    if (minutes <= 1) return 'بعد دقيقة واحدة';
    if (minutes === 2) return 'بعد دقيقتين';
    return this.d('بعد ' + minutes + (minutes <= 10 ? ' دقائق' : ' دقيقة'));
  };

  // Reminder and call to prayer
  T.apLabel = function () { return this.ar ? 'اقتربت الصلاة' : 'PRAYER APPROACHING'; };
  /** "Asr in 13 minutes". */
  T.apTitle = function (prayer, minutes, hoursAndMinutes) {
    if (!this.ar && minutes < 60) return this.d(prayer + ' in ' + minutes + (minutes === 1 ? ' minute' : ' minutes'));
    return prayer + ' ' + this.inMinutes(minutes, hoursAndMinutes);
  };
  T.apSub = function (time) { return this.d((this.ar ? 'الأذان ' : 'Adhan at ') + time + (this.ar ? ' · رجوع للإغلاق' : ' · Back to dismiss')); };
  T.apOk = function () { return this.ar ? 'حسنًا' : 'Got it'; };
  T.nowLabel = function () { return this.ar ? 'حان الآن وقت صلاة' : "IT'S TIME FOR"; };
  T.play = function () { return this.ar ? 'تشغيل الأذان' : 'Play adhan'; };
  T.stop = function () { return this.ar ? 'إيقاف الأذان' : 'Stop adhan'; };
  T.dismiss = function () { return this.ar ? 'إغلاق' : 'Dismiss'; };

  // LG: the system toast over other apps carries the reminder (one line) and the start of a prayer whose adhan is off.
  T.toastReminder = function (prayer, minutes, hoursAndMinutes, time) {
    return this.apTitle(prayer, minutes, hoursAndMinutes) + this.sep() + this.d((this.ar ? 'الأذان ' : 'Adhan at ') + time);
  };
  T.toastNow = function (prayer, time) {
    return (this.ar ? 'حان الآن وقت صلاة ' + prayer : "It's time for " + prayer) + this.sep() + this.d(time);
  };

  // Radio
  T.radio = function () { return this.ar ? 'الإذاعة' : 'Radio'; };
  T.station = function (s) { return this.d(this.ar ? s.ar : s.en); };
  T.stationWhere = function (s) { return this.d(this.ar ? s.whereAr : s.whereEn); };
  /** A station in a list: its name and place, since several are called إذاعة القرآن الكريم. */
  T.stationChoice = function (s) { return s.reciter ? this.station(s) : this.station(s) + this.sep() + this.stationWhere(s); };
  T.stationRow = function () { return this.ar ? 'المحطة' : 'Station'; };
  T.stationGroups = function () {
    return this.ar ? ['إذاعات القرآن الكريم', 'القرّاء'] : ['Quran radio stations', 'Reciters'];
  };
  T.radioStatus = function (s) {
    switch (s) {
      case 2: return this.ar ? 'على الهواء' : 'On air';
      case 1: return this.ar ? 'جارٍ الاتصال…' : 'Connecting…';
      case 3: return this.ar ? 'انقطع البث · نعيد المحاولة' : 'Signal lost · retrying';
      case 4: return this.ar ? 'متوقفة للأذان' : 'Paused for the adhan';
      default: return this.ar ? 'متوقفة' : 'Off';
    }
  };
  T.radioPlay = function () { return this.ar ? 'تشغيل' : 'Play'; };
  T.radioStop = function () { return this.ar ? 'إيقاف' : 'Stop'; };
  T.screenOff = function () { return this.ar ? 'إطفاء الشاشة' : 'Screen off'; };
  // Live from Makkah and Madinah: Home's Live pill, its list and the video panel.
  T.live = function () { return this.ar ? 'مباشر' : 'Live'; };
  T.liveTitle = function () { return this.ar ? 'الحرمان الشريفان' : 'Makkah & Madinah'; };
  /** In the order of Live.CHANNELS: Makkah, Madinah. */
  T.livePlaces = function () { return this.ar ? ['مكة المكرمة', 'المدينة المنورة'] : ['Makkah', 'Madinah']; };
  /** Live.CONNECTING, PLAYING, FAILED. */
  T.liveStatus = function (s) {
    if (s === 2) return this.ar ? 'على الهواء' : 'On air';
    if (s === 3) return this.ar ? 'تعذّر تشغيل البث' : "Couldn't play the live stream";
    return this.ar ? 'جارٍ الاتصال…' : 'Connecting…';
  };
  T.liveNote = function () {
    return this.ar ? 'بث مباشر من قناتي القرآن الكريم والسنة النبوية على منصة الأولى · يتوقف عند مغادرة الرئيسية'
      : 'Live from the Quran and Sunnah channels on Aloula · stops when you leave Home';
  };
  T.fullScreen = function () { return this.ar ? 'ملء الشاشة' : 'Full screen'; };
  T.fullScreenHint = function () {
    return this.ar ? 'رجوع للخروج من ملء الشاشة     ▲▼  الجودة' : 'Back to exit full screen     ▲▼  Quality';
  };
  T.quality = function () { return this.ar ? 'الجودة' : 'Quality'; };
  /** A rendition in the quality list: "480p · ~750 MB/h", its data per hour from its bits per second. */
  T.qualityItem = function (height, bitsPerSecond) {
    var mb = bitsPerSecond * 3600 / 8 / 1e6, gb = mb >= 1000;
    var n = gb ? (mb / 1000).toFixed(1) : String(Math.round(mb / 10) * 10);
    if (this.eastern) n = n.replace('.', '٫');
    // In Arabic «نحو», not "~": an Arabic word between the Latin runs keeps "1080p · نحو 4.8 جيجا/ساعة" in order
    // from the right (Chromium 68 ignores the isolate marks).
    var size = height ? height + 'p' : '—';
    if (this.ar) return this.d(size + ' · نحو ' + n + (gb ? ' جيجا/ساعة' : ' ميجا/ساعة'));
    return this.d(size + ' · ~' + n + (gb ? ' GB/h' : ' MB/h'));
  };
  T.screenOffNote = function () {
    return this.d(this.ar ? 'الشاشة مطفأة والإذاعة تعمل · اضغط أي زر للعودة' : 'Screen off, radio playing · press any key to come back');
  };
  T.radioDarkRow = function () { return this.ar ? 'إطفاء الشاشة أثناء الاستماع' : 'Screen off while listening'; };
  T.radioDarkHelp = function () {
    return this.d(this.ar ? 'توفير الكهرباء: تنطفئ الشاشة وتستمر الإذاعة · أي زر يعيدها'
                          : 'Saves power: the screen goes dark, the radio keeps playing · any key brings it back');
  };
  T.radioDarkChoices = function () {
    return this.ar ? ['مع شاشة التوقف', 'بعدها بـ 15 د', 'أبدًا'] : ['With screensaver', '15 min later', 'Never'];
  };
  // LG: night mode, a dimmer and warmer look (Home's moon button and Settings → Display).
  T.nightRow = function () { return this.ar ? 'الوضع الليلي' : 'Night mode'; };
  T.nightHelp = function () { return this.ar ? 'ألوان أهدأ وأخفت للمشاهدة ليلًا' : 'Calmer, dimmer colours for watching at night'; };
  T.nightOn = function () { return this.ar ? 'تشغيل الوضع الليلي' : 'Night mode on'; };
  T.nightOff = function () { return this.ar ? 'إيقاف الوضع الليلي' : 'Night mode off'; };
  // LG: turning the panel off goes through the TV's remote-control connection, which the TV asks about once.
  T.allowPanel = function () {
    return this.ar ? 'للسماح لأفنون بإطفاء الشاشة: اختر «سماح» في رسالة التلفاز (مرة واحدة فقط)'
                   : 'To let Afnon turn the screen off, choose Allow on the TV\'s message (once only)';
  };
  // LG: Afnon is an app here, not the home screen, so the radio lives while Afnon is open.
  T.radioNoteLg = function () {
    return this.d(this.ar ? 'تعمل ما دام أفنون مفتوحًا · تتوقف عند الخروج منه'
                          : 'Plays while Afnon is open · stops when you leave it');
  };
  T.hintClose = function () { return this.ar ? 'رجوع  إغلاق' : 'Back  Close'; };
  T.sectionRadio = function () { return this.ar ? 'الإذاعة' : 'Radio'; };
  T.radioRowHelp = function (s) { return this.stationWhere(s) + (this.ar ? ' · تحتاج إلى الإنترنت' : ' · needs the internet'); };
  T.afterAdhanRow = function () { return this.ar ? 'بعد الأذان' : 'After the adhan'; };
  T.afterAdhanHelp = function () { return this.ar ? 'تتوقف الإذاعة أثناء الأذان ثم…' : 'The radio pauses for the adhan, then…'; };
  T.afterAdhanChoices = function () { return this.ar ? ['تُستأنف', 'تبقى متوقفة'] : ['Resumes', 'Stays off']; };

  T.nowHint = function (minutes) {
    if (minutes === 0) return this.ar ? 'رجوع للإغلاق · يُغلق تلقائيًا بعد الأذان' : 'Back to dismiss · closes by itself after the adhan';
    return this.d(this.ar ? 'رجوع للإغلاق · يُغلق تلقائيًا بعد ' + (minutes === 1 ? 'دقيقة' : minutes + ' دقائق')
                          : 'Back to dismiss · closes by itself after ' + minutes + ' min');
  };
  T.callCloseRow = function () { return this.ar ? 'إغلاق شاشة الأذان' : 'Close the call screen'; };
  T.callCloseHelp = function () { return this.ar ? 'ثم تعود إلى ما كنت تشاهده' : 'Then back to what you were watching'; };
  T.callCloseChoices = function () {
    return this.ar ? ['بعد الأذان', '1 د', '5 د', '10 د'] : ['After adhan', '1 min', '5 min', '10 min'];
  };
  T.voiceRow = function () { return this.ar ? 'صوت الأذان' : 'Adhan voice'; };
  T.voiceHelp = function () { return this.ar ? 'لكل الصلوات عدا الفجر · يُسمع عند التنقل في القائمة' : 'Every prayer but Fajr · plays as you move through the list'; };
  T.fajrVoiceRow = function () { return this.ar ? 'أذان الفجر' : 'Fajr adhan'; };
  T.fajrVoiceHelp = function () { return this.ar ? 'يُفضَّل أذان فيه «الصلاة خير من النوم»' : 'Best with “prayer is better than sleep”'; };

  T.back = function () { return this.ar ? 'رجوع' : 'Back'; };
  T.cancel = function () { return this.ar ? 'إلغاء' : 'Cancel'; };
  T.hintOpen = function () { return this.ar ? 'OK  فتح' : 'OK  Open'; };

  // Prayer day
  T.dayTitle = function () { return this.ar ? 'مواقيت اليوم' : "Today's prayers"; };
  T.home = function () { return this.ar ? 'الرئيسية' : 'Home'; };
  T.school = function (madhab) {
    if (madhab === 'hanafi') return this.ar ? 'العصر: الحنفي' : 'Asr: Hanafi';
    return this.ar ? 'العصر: الجمهور (شافعي)' : 'Asr: standard (Shafi‘i)';
  };

  T.methodName = function (m) {
    switch (m) {
      case 'UMM_AL_QURA': return this.ar ? 'أم القرى، مكة المكرمة' : 'Umm al-Qura, Makkah';
      case 'MUSLIM_WORLD_LEAGUE': return this.ar ? 'رابطة العالم الإسلامي' : 'Muslim World League';
      case 'KARACHI': return this.ar ? 'جامعة العلوم الإسلامية، كراتشي' : 'University of Islamic Sciences, Karachi';
      case 'DUBAI': return this.ar ? 'دبي' : 'Dubai';
      case 'KUWAIT': return this.ar ? 'الكويت' : 'Kuwait';
      case 'QATAR': return this.ar ? 'قطر' : 'Qatar';
      case 'NORTH_AMERICA': return this.ar ? 'الجمعية الإسلامية لأمريكا الشمالية' : 'ISNA, North America';
      case 'MOON_SIGHTING_COMMITTEE': return this.ar ? 'لجنة رؤية الهلال' : 'Moonsighting Committee';
      case 'SINGAPORE': return this.ar ? 'سنغافورة' : 'Singapore';
      default: return this.ar ? 'الهيئة المصرية العامة للمساحة' : 'Egyptian General Authority of Survey';
    }
  };

  /** "Fajr angle 19.5° · Isha 17.5°", or Isha as minutes after Maghrib where the method fixes it that way. a: Prayer.angles(). */
  T.methodAngles = function (a) {
    var fajr = (this.ar ? 'زاوية الفجر ' : 'Fajr angle ') + a.fajr + '°';
    var isha = a.interval > 0
      ? (this.ar ? 'العشاء بعد المغرب بـ ' + a.interval + ' دقيقة' : 'Isha ' + a.interval + ' min after Maghrib')
      : (this.ar ? 'العشاء ' : 'Isha ') + a.isha + '°';
    return this.d(fajr + ' · ' + isha);
  };

  // Settings
  T.sectionPrayer = function () { return this.ar ? 'مواقيت الصلاة' : 'Prayer times'; };
  T.sectionReminders = function () { return this.ar ? 'التنبيهات والأذان' : 'Reminders & adhan'; };
  T.sectionDisplay = function () { return this.ar ? 'العرض واللغة' : 'Display & language'; };
  T.sectionNews = function () { return this.ar ? 'ما الجديد' : "What's new"; };
  /** A release's heading on the What's new page: «أفنون 0.2.0» / "Afnon 0.2.0", in the chosen digits. */
  T.newsVersion = function (version) {
    return (this.ar ? 'أفنون ' : 'Afnon ') + (this.eastern ? this.d(version).replace(/\./g, '٫') : version);
  };
  /**
   * Settings → What's new, newest release first: each group is a version (its heading, newsVersion), then a few
   * short lines, the same lines in the same order in both languages. Each line goes through d(), so its numbers
   * follow the digits setting. Each release puts its group on top.
   */
  T.news = function () {
    if (this.ar) return [
      ['0.2.0',
        '136 مدينة في 43 دولة، تُختار بالمنطقة ثم الدولة ثم المدينة',
        'لكل مدينة مذهب العصر المعتاد فيها، ويبقى تغييره ممكنًا',
        'مع الأرقام اللاتينية، الأرقام الكبيرة بخط الإنجليزية (Marcellus)، والعدّ التنازلي ثابت في مكانه',
        'بث مباشر من مكة المكرمة والمدينة المنورة: زر «مباشر» في الرئيسية، مع ملء الشاشة واختيار الجودة',
        'من السعودية: إذاعة القرآن الكريم وإذاعة نداء الإسلام',
        'لم تعد إذاعة القرآن الكريم من القاهرة ضمن المحطات',
        'هذه الصفحة: ما الجديد في كل إصدار'],
      ['0.1.0',
        'أول إصدار لتلفاز LG: الصلاة القادمة والعدّ التنازلي في المحراب، ومواقيت اليوم والقبلة',
        'الأذان في وقته فوق أي تطبيق أو مدخل HDMI',
        'التنبيه قبل الصلاة نصًّا وصوتًا',
        'إذاعات القرآن الكريم، وإطفاء الشاشة أثناء الاستماع',
        'الوضع الليلي']
    ];
    return [
      ['0.2.0',
        '136 cities in 43 countries, picked by region, then country, then city',
        'Each city starts on its usual Asr school, which you can still change',
        'With Latin digits in Arabic, the big numbers in the English font (Marcellus), and the countdown holds still',
        'Live from Makkah and Madinah: the Live button on Home, with full screen and a choice of quality',
        'From Saudi Arabia: Holy Quran Radio and Nida Al-Islam Radio',
        "Cairo's Holy Quran Radio is no longer in the list",
        "This page: what's new in each release"],
      ['0.1.0',
        'The first version for LG TVs: the next prayer and countdown in the mihrab, today\'s prayers and the Qibla',
        'The adhan at prayer time, over any app or HDMI input',
        'Reminders before each prayer, on screen and spoken',
        'Quran radio, and the screen off while you listen',
        'Night mode']
    ];
  };
  T.preview = function () { return this.ar ? 'العصر اليوم بهذه الإعدادات' : 'Asr today with these settings'; };
  T.location = function () { return this.ar ? 'الموقع' : 'Location'; };
  T.country = function () { return this.ar ? 'الدولة' : 'Country'; };
  T.region = function () { return this.ar ? 'المنطقة' : 'Region'; };
  /** Location's first step, in the order of Prayer.REGIONS. */
  T.regions = function () {
    return this.ar ? ['الدول العربية', 'آسيا', 'أوروبا', 'الأمريكتان', 'أفريقيا', 'أوقيانوسيا']
      : ['Arab world', 'Asia', 'Europe', 'Americas', 'Africa', 'Oceania'];
  };
  T.locationHelp = function (lat, lng) {
    var ns = lat >= 0 ? (this.ar ? 'ش' : 'N') : (this.ar ? 'ج' : 'S');
    var ew = lng >= 0 ? (this.ar ? 'ق' : 'E') : (this.ar ? 'غ' : 'W');
    return this.d(Math.abs(lat).toFixed(2) + '° ' + ns + ' · ' + Math.abs(lng).toFixed(2) + '° ' + ew
      + (this.ar ? ' · يُختار من القائمة' : ' · chosen from the list'));
  };
  T.place = function (city, country) { return city + (this.ar ? '، ' : ', ') + country; };
  T.method = function () { return this.ar ? 'طريقة الحساب' : 'Calculation method'; };
  T.asrSchool = function () { return this.ar ? 'مذهب العصر' : 'Asr school'; };
  T.asrSchoolHelp = function () { return this.ar ? 'يغيّر وقت العصر فقط' : 'Only changes the Asr time'; };
  T.asrSchools = function () { return this.ar ? ['الجمهور', 'الحنفي'] : ['Standard', 'Hanafi']; };
  T.hijriAdjust = function () { return this.ar ? 'تعديل التاريخ الهجري' : 'Hijri date adjustment'; };
  T.hijriToday = function (date) { return (this.ar ? 'اليوم: ' : 'Today: ') + date; };
  T.days = function (n) {
    var sign = n > 0 ? '+' : '';
    if (!this.ar) return this.d(sign + n + (Math.abs(n) === 1 ? ' day' : ' days'));
    return this.d(sign + n + (Math.abs(n) === 2 ? ' يومان' : ' يوم'));
  };
  T.roomRow = function () { return this.roomTitle(); };
  T.roomHelp = function () { return this.ar ? 'لمعرفة القبلة بالنسبة لمكان جلوسك' : 'So the Qibla is shown from where you sit'; };
  T.notSet = function () { return this.ar ? 'لم يُحدَّد' : 'Not set'; };
  T.remind = function () { return this.ar ? 'التنبيه قبل الصلاة' : 'Remind me before prayer'; };
  T.remindHelp = function () { return this.ar ? 'على الرئيسية وفوق الفيديو' : 'On Home and over video'; };
  T.remindChoices = function () {
    return this.ar ? ['5 د', '10 د', '15 د', '20 د', '30 د', 'إيقاف'] : ['5 min', '10 min', '15 min', '20 min', '30 min', 'Off'];
  };
  T.remindVoiceRow = function () { return this.ar ? 'تذكير صوتي' : 'Spoken reminder'; };
  T.remindVoiceHelp = function () { return this.ar ? '«اقترب موعد صلاة …» مع التذكير' : 'Says «اقترب موعد صلاة …» with the reminder'; };
  T.announceRow = function () { return this.ar ? 'إعلان دخول الوقت' : 'Announce the time'; };
  T.announceHelp = function () {
    return this.ar ? '«حان الآن موعد صلاة …» للصلاة التي أذانها متوقف' : "Says «حان الآن موعد صلاة …» when a prayer's adhan is off";
  };
  T.adhanRow = function () { return this.ar ? 'الأذان' : 'Adhan'; };
  T.adhanHelp = function () { return this.ar ? 'يُشغَّل عند دخول الوقت · يمكن إيقافه لكل صلاة' : 'Plays when the time begins · can be muted per prayer'; };
  T.language = function () { return this.ar ? 'اللغة' : 'Language'; };
  T.languageHelp = function () { return this.ar ? '«التلفاز» يتبع لغة التلفاز' : '“TV” follows the TV\'s language'; };
  T.languages = function () { return [this.ar ? 'التلفاز' : 'TV', 'العربية', 'English']; };
  T.digits = function () { return this.ar ? 'الأرقام' : 'Digits'; };
  T.clockRow = function () { return this.ar ? 'الساعة' : 'Clock'; };
  T.clockHelp = function () { return this.ar ? '«التلفاز» يتبع إعداد الوقت في التلفاز' : '“TV” follows the TV\'s time setting'; };
  T.clocks = function () { return this.ar ? ['التلفاز', '12 س', '24 س'] : ['TV', '12 h', '24 h']; };
  T.hintMove = function () { return this.ar ? '▲▼  تنقل' : '▲▼  Move'; };
  T.hintChange = function () { return this.ar ? '◀▶  تغيير القيمة' : '◀▶  Change value'; };
  T.hintChoose = function () { return this.ar ? 'OK  اختيار' : 'OK  Choose'; };
  T.hintBackMenu = function () { return this.ar ? 'رجوع  القائمة' : 'Back  Menu'; };
  T.qibla = function () { return this.ar ? 'القبلة' : 'QIBLA'; };
  T.north = function () { return this.ar ? 'الشمال ▲' : '▲ North'; };
  T.qiblaHint = function () { return this.ar ? 'وجّه الشمال على البوصلة نحو الشمال الحقيقي' : 'Line up the compass north with true north'; };
  T.bellToggle = function () { return this.ar ? 'تشغيل/إيقاف الأذان لهذه الصلاة' : 'Adhan on/off for this prayer'; };
  T.hintBackHome = function () { return this.ar ? 'رجوع  الرئيسية' : 'Back  Home'; };
  T.bell = function (on) { return this.ar ? (on ? 'الأذان مفعّل' : 'الأذان متوقف') : (on ? 'Adhan on' : 'Adhan off'); };
  T.rowNow = function () { return this.ar ? 'الآن' : 'now'; };
  /** Sunrise is masculine in Arabic (الشروق مضى); the prayers are feminine (الصلاة مضت). */
  T.passed = function (sunrise) { return this.ar ? (sunrise ? 'مضى' : 'مضت') : 'passed'; };
  T.in = function (duration) { return this.d(this.ar ? 'بعد ' + duration : 'in ' + duration); };

  /** "South-east · from Cairo" for a bearing in degrees from true north. */
  T.qiblaDirection = function (bearing) { return this.octant(bearing) + (this.ar ? ' · من ' : ' · from ') + this.city(); };

  function sector(degrees) { return Math.round((((degrees % 360) + 360) % 360) / 45) % 8; }

  T.octant = function (bearing) {
    var names = this.ar ? ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب']
                        : ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];
    return names[sector(bearing)];
  };

  /** Where the Qibla is for someone facing the TV, from its angle clockwise from straight ahead. */
  T.qiblaRelative = function (clockwise) {
    var where = this.ar
      ? ['أمامك', 'أمامك إلى اليمين', 'على يمينك', 'خلفك إلى اليمين', 'خلفك', 'خلفك إلى اليسار', 'على يسارك', 'أمامك إلى اليسار']
      : ['ahead of you', 'ahead, to your right', 'to your right', 'behind, to your right', 'behind you',
         'behind, to your left', 'to your left', 'ahead, to your left'];
    return (this.ar ? 'القبلة ' : 'Qibla is ') + where[sector(clockwise)];
  };

  /** "North-west · 320°". */
  T.bearingLabel = function (degrees) { return this.d(this.octant(degrees) + ' · ' + degrees + '°'); };
  T.facingLine = function (facing) { return (this.ar ? 'تجلس مواجهًا: ' : 'You face: ') + this.bearingLabel(facing); };
  T.tvMarker = function () { return this.ar ? 'التلفاز ▲' : '▲ TV'; };
  T.roomButton = function (set) { return this.ar ? (set ? 'تغيير اتجاه الغرفة' : 'حدّد اتجاه الغرفة') : (set ? 'Change room direction' : 'Set room direction'); };
  T.roomTitle = function () { return this.ar ? 'اتجاه الغرفة' : 'Room direction'; };
  T.roomTip = function () {
    return this.ar ? 'قف مواجهًا للتلفاز، وافتح تطبيق البوصلة في هاتفك وأمسكه مستويًا أمامك، ثم اضبط الرقم هنا على ما تقرؤه. يكفي ذلك مرة واحدة ما دام التلفاز في مكانه.'
                   : 'Stand facing the TV, open the compass app on your phone and hold it flat in front of you, then set the number here to what it reads. Once is enough while the TV stays where it is.';
  };
  T.roomKeys = function () { return this.d(this.ar ? '◀ ▶  5°     ▲ ▼  45°     OK  حفظ     رجوع  إلغاء' : '◀ ▶  5°     ▲ ▼  45°     OK  Save     Back  Cancel'); };
  T.hintQibla = function () { return this.ar ? '◀  القبلة' : '▶  Qibla'; };
  T.hintTimes = function () { return this.ar ? '▶  المواقيت' : '◀  Times'; };
  // LG: Home's courtyard keys toward the radio card and Settings.
  T.hintRadio = function () { return this.ar ? '◀  الإذاعة' : '▶  Radio'; };

  /** Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha. */
  T.prayerNames = function () {
    return this.ar ? ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء']
                   : ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  };

  T.hijriMonths = function () {
    return this.ar ? ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
                      'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة']
                   : ['Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani", 'Jumada al-Ula',
                      'Jumada al-Akhirah', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', 'Dhu al-Qadah',
                      'Dhu al-Hijjah'];
  };
  T.hijriSuffix = function () { return this.ar ? ' هـ' : ' AH'; };

  // LG: Gregorian dates as Android's SimpleDateFormat("EEEE d MMMM yyyy") gives them (ar-EG, en-GB).
  T.weekdays = function () {
    return this.ar ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
                   : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  };
  T.months = function () {
    return this.ar ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
                   : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  };

  // ---------------------------------------------------------------- adjusting the times (Settings → Prayer times)

  T.sectionAdjust = function () { return this.ar ? 'تعديل المواقيت' : 'Adjust the times'; };
  /** A time's adjustment between its − and + buttons: "+2", "0", "-3" (minutes). */
  T.minutesSigned = function (n) { return this.d(n > 0 ? '+' + n : String(n)); };
  /** Under each time's name: what it is today with the adjustment, and what the buttons do. */
  T.adjustTimeHelp = function (time) {
    return this.d(this.ar ? 'اليوم ' + time + ' · بالدقائق، حتى 30 قبله أو بعده'
                          : 'Today ' + time + ' · in minutes, up to 30 earlier or later');
  };
  // Settings keys (the TCL build's fix): the arrows only move, OK edits, then OK saves or Back cancels.
  T.hintEdit = function () { return this.ar ? 'OK  تعديل' : 'OK  Edit'; };
  T.hintSwitch = function () { return this.ar ? 'OK  تشغيل/إيقاف' : 'OK  On/Off'; };
  T.hintSave = function () { return this.ar ? 'OK  حفظ' : 'OK  Save'; };
  T.hintBackCancel = function () { return this.ar ? 'رجوع  إلغاء' : 'Back  Cancel'; };
  T.saved = function () { return this.ar ? '✓  تم الحفظ' : '✓  Saved'; };

  // ---------------------------------------------------------------- launcher: Home's apps and All apps (Text.java)

  T.loadingApps = function () { return this.ar ? 'جارٍ التحميل…' : 'Loading…'; };
  T.fav = function () { return this.ar ? 'المفضلة' : 'FAVOURITES'; };
  T.more = function () { return this.ar ? 'المزيد' : 'MORE'; };
  /** Home's tile: the label over the count. */
  T.all = function (n) { return this.d((this.ar ? 'كل التطبيقات' : 'All apps') + '\n' + n); };
  T.hintApps = function () { return this.ar ? '◀  التطبيقات' : '▶  Apps'; };
  T.hintMore = function () { return this.ar ? '▼  المزيد' : '▼  More'; };
  T.hintFavs = function () { return this.ar ? '▲  المفضلة' : '▲  Favourites'; };
  T.open = function (app) { return this.ar ? 'فتح ' + app : 'Open ' + app; };
  T.network = function () { return this.ar ? 'إعدادات الشبكة' : 'Network settings'; };
  T.wired = function () { return this.ar ? 'سلكي' : 'Wired'; };
  T.allTitle = function () { return this.ar ? 'كل التطبيقات' : 'All apps'; };
  /** "Asr in", followed by the countdown. */
  T.chip = function (prayer) { return this.ar ? prayer + ' بعد' : prayer + ' in'; };
  T.favNote = function (position) {
    var ord = ['الأول', 'الثاني', 'الثالث', 'الرابع'];
    return this.ar ? 'في المفضلة · ' + ord[position - 1] : this.d('In favourites · position ' + position);
  };
  T.notFav = function () { return this.ar ? 'اضغط مطولًا على OK لوضعه في المفضلة' : 'Hold OK to put it in favourites'; };
  T.hintHold = function () { return this.ar ? 'اضغط مطولًا  ترتيب المفضلة' : 'Hold OK  Arrange favourites'; };
  T.moveEarlier = function () { return this.ar ? 'تقديمه في المفضلة' : 'Move earlier in favourites'; };
  T.moveLater = function () { return this.ar ? 'تأخيره في المفضلة' : 'Move later in favourites'; };
  T.putInPlaceOf = function (app) { return this.ar ? 'ضعه في المفضلة مكان ' + app : 'Put in favourites instead of ' + app; };
  /** LG: names for the TV's own apps where its list has none in Arabic (Apps.AR_NAMES). */
  T.appName = function (id, title) {
    var ar = {
      'youtube.leanback.v4': 'يوتيوب', 'net.mbc.shahid-lgapp': 'شاهد', 'com.webos.app.browser': 'المتصفح',
      'com.webos.app.livetv': 'التلفاز', 'com.palm.app.settings': 'الإعدادات',
      'com.webos.app.photovideo': 'الصور والفيديو', 'com.webos.app.music': 'الموسيقى',
      'com.webos.app.discovery': 'متجر LG', 'com.webos.app.hdmi1': 'HDMI 1', 'com.webos.app.hdmi2': 'HDMI 2',
      'com.webos.app.hdmi3': 'HDMI 3'
    };
    var en = { 'net.mbc.shahid-lgapp': 'Shahid', 'com.webos.app.hdmi1': 'HDMI 1',
      'com.webos.app.hdmi2': 'HDMI 2', 'com.webos.app.hdmi3': 'HDMI 3' };
    if (this.ar && ar[id]) return ar[id];
    return en[id] || title || id;
  };

  // ---------------------------------------------------------------- shared formatting (Screen.java)

  function two(n) { return n < 10 ? '0' + n : String(n); }

  /** mm:ss under an hour; above it h:mm:ss, or h:mm without seconds. Western digits; pass through d(). */
  Text.duration = function (seconds, withSeconds) {
    var h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    if (h === 0) return two(m) + ':' + two(s);
    return withSeconds ? h + ':' + two(m) + ':' + two(s) : h + ':' + two(m);
  };

  /** Seconds from now until a moment, rounded up, never negative (Screen.secondsUntil). */
  Text.secondsUntil = function (whenMs, nowMs) {
    return Math.max(0, Math.floor((whenMs - nowMs + 999) / 1000));
  };

  /**
   * A clock time from a wall Date (UTC fields are the local time): {hm, marker}; marker is empty in 24-hour.
   * In 12-hour the page draws the marker (ص/م, AM/PM) smaller, as Android's RelativeSizeSpan does.
   */
  T.clockParts = function (wall, h24) {
    var h = wall.getUTCHours(), m = wall.getUTCMinutes();
    if (h24) return { hm: this.d(two(h) + ':' + two(m)), marker: '' };
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return { hm: this.d(h12 + ':' + two(m)), marker: this.ampm(h < 12) };
  };
  /** The same as running text: "3:52 م". */
  T.clock = function (wall, h24) {
    var p = this.clockParts(wall, h24);
    return p.marker ? p.hm + ' ' + p.marker : p.hm;
  };

  /** "Wednesday 21 October 2026" in the screen's language and digits, from a wall Date. */
  T.gregorian = function (wall) {
    return this.d(this.weekdays()[wall.getUTCDay()] + ' ' + wall.getUTCDate() + ' ' + this.months()[wall.getUTCMonth()] + ' ' + wall.getUTCFullYear());
  };
  /** The Gregorian date without its weekday: the weekday goes with the Hijri date, which turns at Maghrib. */
  T.gregorianDate = function (wall) {
    return this.d(wall.getUTCDate() + ' ' + this.months()[wall.getUTCMonth()] + ' ' + wall.getUTCFullYear());
  };

  return Text;
});
