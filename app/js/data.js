/* Afnon LG: the radio stations (Radio.java) and adhan recordings (Adhans.java), as on Android. ES5. */
(function (root) {
  'use strict';

  var QURAN_AR = 'إذاعة القرآن الكريم', QURAN_EN = 'Holy Quran Radio';

  function station(id, ar, en, whereAr, whereEn, url) {
    return { id: id, ar: ar, en: en, whereAr: whereAr, whereEn: whereEn, url: url, reciter: false };
  }
  function reciter(id, ar, en) {
    return { id: id, ar: ar, en: en, whereAr: 'تلاوة على مدار الساعة', whereEn: 'Recitation, around the clock',
      url: 'https://backup.qurango.net/radio/' + id, reciter: true };
  }

  /**
   * Each station's own stream, the one its website or official player uses. Qatar, Jordan and the Saudi ones are HLS;
   * the rest MP3 or AAC. Reciters are mp3quran.net's 24/7 channels, MP3 at 128 kbps.
   */
  var STATIONS = [
    station('nablus', QURAN_AR, QURAN_EN, 'نابلس', 'Nablus', 'https://quran-radio.org:8899/;'),
    station('shabab', 'شباب إف إم · قرآن', 'Shabab FM Quran', 'نابلس', 'Nablus', 'https://streaming.zaytonatube.com/ShababFM.aac'),
    station('qatar', QURAN_AR, QURAN_EN, 'قطر', 'Qatar', 'https://live.kwikmotion.com/qmcquranradiolive/quranradio/playlist.m3u8'),
    station('qatar2', QURAN_AR + ' 2', QURAN_EN + ' 2', 'قطر', 'Qatar', 'https://live.kwikmotion.com/qmcquranradio2live/quranradio2/playlist.m3u8'),
    station('jordan', QURAN_AR, QURAN_EN, 'الأردن', 'Jordan', 'https://jrtv-live.ercdn.net/jrradio/quranradio.m3u8'),
    // The Saudi Broadcasting Authority's own audio streams, as Saudi Radio+ (radioplus.sba.sa) plays them: HLS, AAC
    // at about 192 kbps, no token, on the Qatar stations' host.
    station('ksa_quran', QURAN_AR, QURAN_EN, 'السعودية', 'Saudi Arabia', 'https://live.kwikmotion.com/sbrksaquranradiolive/ksaquranradio/playlist.m3u8'),
    station('ksa_nida', 'إذاعة نداء الإسلام', 'Nida Al-Islam Radio', 'السعودية', 'Saudi Arabia', 'https://live.kwikmotion.com/sbrksanedaradiolive/ksanedaradio/playlist.m3u8'),
    reciter('mishary_alafasi', 'مشاري العفاسي', 'Mishary Alafasy'),
    reciter('abdulbasit_abdulsamad', 'عبد الباسط عبد الصمد', 'Abdul Basit Abdul Samad'),
    reciter('mohammed_siddiq_alminshawi', 'محمد صديق المنشاوي', 'Mohamed Siddiq Al-Minshawi'),
    reciter('mahmoud_khalil_alhussary', 'محمود خليل الحصري', 'Mahmoud Khalil Al-Husary'),
    reciter('maher', 'ماهر المعيقلي', 'Maher Al-Muaiqly'),
    reciter('saad_alghamdi', 'سعد الغامدي', 'Saad Al-Ghamdi'),
    reciter('abdulrahman_alsudaes', 'عبد الرحمن السديس', 'Abdul Rahman Al-Sudais'),
    reciter('yasser_aldosari', 'ياسر الدوسري', 'Yasser Al-Dosari'),
    reciter('nasser_alqatami', 'ناصر القطامي', 'Nasser Al-Qatami'),
    reciter('mohammad_rashad_alshareef', 'محمد رشاد الشريف', 'Mohammad Rashad Al-Shareef')
  ];

  /** id (sounds/adhan/<id>.mp3), Arabic name, English name. */
  var VOICES = [
    ['alafasy', 'مشاري العفاسي', 'Mishary Alafasy'],
    ['almalki', 'حمدان المالكي', 'Hamdan Al-Malki'],
    ['alarkani', 'إبراهيم الأركاني', 'Ibrahim Al-Arkani'],
    ['chebae_fajr', 'مالك شيباي (أذان الفجر)', 'Malek Chebae (Fajr)'],
    ['alhamathani', 'ماجد الهمذاني', 'Majed Al-Hamathani'],
    ['alzahrani', 'منصور الزهراني', 'Mansoor Az-Zahrani'],
    ['deghreri', 'حمد الدغريري', 'Hamad Al-Deghreri'],
    ['alqatami', 'ناصر القطامي', 'Nasser Al-Qatami'],
    ['khatba', 'صهيب خطبا', 'Suhaib Khatba'],
    ['menshawy', 'محمد صديق المنشاوي', 'Mohammad Al-Menshawy'],
    ['refaat', 'محمد رفعت', 'Mohammad Refaat'],
    ['abdulbasit', 'عبد الباسط عبد الصمد', 'Abdul Basit'],
    ['nuyne', 'أحمد نعينع', 'Ahmad Nuaina'],
    ['makkah', 'الحرم المكي', 'Makkah, Al-Haram']
  ];

  root.AfnonData = { STATIONS: STATIONS, VOICES: VOICES };
})(this);
