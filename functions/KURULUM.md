# Kat Hatirlatma Bildirimi — Kurulum

Bant-basi katlar (1 / 11 / 21 / 31) bitince ilgili bant suresi kadar sonra
Telegram'a bildirim gonderir. Timer'i Google'in sunucusu tuttugu icin telefon
kilitliyken / tarayici kapaliyken bile bildirim gelir.

- Kat 1 bitti  -> 1 saat sonra
- Kat 11 bitti -> 1.5 saat sonra
- Kat 21 bitti -> 2 saat sonra
- Kat 31 bitti -> 2.5 saat sonra

## Tek seferlik kurulum

### 1) Firebase'i Blaze planina gecir
https://console.firebase.google.com/project/bt-analiz/usage/details
-> "Modify plan" -> Blaze (kullandikca ode). Bu kullanim ucretsiz kotanin
cok altinda kalir; pratikte 0 TL. Cloud Functions icin sart.

### 2) Telegram botu olustur ve token al
1. Telegram'da **@BotFather**'a yaz: `/newbot`
2. Bota bir isim ve kullanici adi ver.
3. Sana verdigi **token**'i kopyala (or. `123456:ABC-DEF...`).

### 3) Kendi chat id'ni ogren
1. Az once olusturdugun bota Telegram'dan herhangi bir mesaj at (or. "selam").
2. Telegram'da **@userinfobot**'a yaz; sana **numeric Id** verir (or. `987654321`).
   Bu senin chat id'in.

### 4) Secret'lari tanimla (proje klasorunde)
```
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TELEGRAM_CHAT_ID
```
Her komut sorunca yukaridaki token / chat id degerini yapistir.

### 5) Deploy et
```
firebase deploy --only functions,firestore:rules,hosting
```
- `functions`  -> dakikada bir calisan hatirlatma fonksiyonu
- `firestore:rules` -> floorReminders koleksiyon kurallari
- `hosting`    -> guncellenmis otobirlik.user.js (v5.2)

### 6) Tampermonkey scriptini guncelle
Tampermonkey otomatik gunceller (updateURL). Hemen istersen Tampermonkey
panelinden "Check for userscript updates" calistir ya da scripti yeniden kur.

## Test
- otobirlik panelinde **"Kat suresi dolunca Telegram bildirimi"** kutusunun
  isaretli oldugundan emin ol (varsayilan acik).
- Oto kat modunu 1-... araliginda baslat; kat 1 bitince panelde
  "Hatirlatma kuruldu: SS:DD" yazar.
- Hizli denemek icin functions/index.js'i gecici degistirip sureyi kisaltabilir
  ya da Firestore konsolundan `floorReminders/floorrem_1` dokumaninda `dueAt`
  degerini gecmise cekip bir dakika bekleyebilirsin.

## Nasil calisir
1. Script kat 1/11/21/31 bitince `floorReminders/floorrem_<kat>` dokumanina
   `dueAt = simdi + bant suresi` yazar (id kat basina sabit -> tekrar temizleyince
   timer bastan kurulur).
2. `sendFloorReminders` fonksiyonu dakikada bir `sent==false` kayitlari tarar,
   `dueAt <= simdi` olanlari Telegram'a yollar ve `sent:true` yapar.

## Maliyet
Gunluk ~1440 fonksiyon cagrisi + birkac Firestore okuma. Firebase ucretsiz
kotalarinin cok altinda; pratikte 0.
