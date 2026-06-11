# Simulator Arastirma Raporu - 2026-06-11

## Ozet (TL;DR)

`test-sonuclari-1-40` arsivindeki kalan **11 yanlis** savas incelendi. Kullanicinin
ekran goruntuleriyle isaret ettigi ipucu (bazi yanlislarin Guvenli/Gercek/Simulator
modlarinda dogru cikmasi) izlenerek kok neden bulundu:

**Tam .5 kesirli muttefik hasari gercek oyunda deterministik degil.** Ayni
`1 Banshee x 7 atk x 0.5 = 3.5` vurusu arsivdeki bir savasta 4 kultist
olduruyor (kat2#5 dogrusu, yukari yuvarlama), baska bir savasta 3 kultist
olduruyor (fail #3, asagi yuvarlama). Hicbir deterministik kural (floor, ceil,
half-up, exact/kesirli can, dar kosullu varyantlar) iki dunyayi ayni anda
saglayamiyor — denendi ve hepsi yuzlerce dogruyu bozdu. Cozum: legacy modda
tam .5 kesirli muttefik hasari **seed'li yazi-turayla** yuvarlaniyor
(kultist rastgeleligiyle ayni RNG).

| Kume | Once | Sonra |
|---|---:|---:|
| Dogrular | 1.946 / 1.946 | **1.946 / 1.946** (hicbiri bozulmadi) |
| Yanlislar | 0 / 11 | **5 / 11 duzeldi** (#3, #5, #6, #9, #10) |

Yeni regresyon testi: `tests/test-half-fraction-random-rounding.js`.

## 1. Mod Taramasi (kullanicinin gozlemi dogrulandi)

`mode-survey.js` her yanlisi 4 hesap moduyla test etti:

| Vaka | legacy | safe (Guvenli) | exact (Gercek) | simulat |
|---|---|---|---|---|
| #2 (kat8) | x | x | x | **eslesti** |
| #3 (kat8) | x | **eslesti** | **eslesti** | x |
| #6 (kat15) | x | **eslesti** | **eslesti** | x |
| #9 (kat20) | x | **eslesti** | **eslesti** | x |
| #10 (kat20) | x | **eslesti** (seed 5) | x | x |
| diger 6 | x | x | x | x |

Ama tum arsivde: safe 1612/1946, exact 1651/1946, simulat 1646/1946 —
ucu de yuzlerce dogruyu bozuyor. Yani hicbir mod genel cozum degil.

## 2. Sapma Noktasi ve Celiski

#3/#6/#9 loglari legacy vs safe diff'lendi (`diffmode.js`): ucunde de ilk
sapma ayni imza — **Banshee -> Namevt Kultist, 1 x 7 x 0.5 = 3.5 hasar**;
legacy 4'e yukari, safe 3'e asagi yuvarliyor. Bir kultistin fazladan sag
kalmasi tum savasi degistiriyor (kultist buff zinciri).

Celiskinin kaniti: kat2#5 dogrusunda birebir ayni vurus var (1 banshee,
kultist hedef, raund 1, hamle 2) ve orada gercek oyun **4** kultist oldurmus.
Fail #3'te ise **3**. Yerel durum ozdes — deterministik kural imkansiz.

Denenen ve elenen deterministik varyantlar (`search.js`, hepsi
`noRecomputeOnZeroDamage` tabanli):

| Varyant | Dogru | Duzelen | Karar |
|---|---:|---:|---|
| bansheeFloorVsCultists | 1.874 | 4/11 | 72 dogru bozuldu |
| allyFloorVsCultists | 1.874 | 5/11 | 72 dogru bozuldu |
| allyHalfDown (tum .5 asagi) | 1.680 | 5/11 | 266 bozuldu |
| bansheeSingleFloor (tek banshee) | 1.916 | 4/11 | 30 bozuldu |
| allyRearFloor, allyDisadvFloor, ... | 1.637-1.700 | 3-5/11 | yuzlerce bozuldu |
| **allyHalfRandom (yazi-tura)** | **1.946** | **5/11** | **UYGULANDI** |

## 3. Yazi-Tura Yamasinin Dogrulamasi

- `determinism-stats.js`: 1.946 dogrunun **1.678'i hic etkilenmiyor**
  (256 seed'in tamami ayni sonucu veriyor). Etkilesen 268 kaydin tamami
  ilk 16 seed icinde eslesiyor; ortalama seed'lerin %93.3'u eslesiyor;
  kirilgan (<=8/256) vaka **sifir**. Yani yama ignenin ucunda bir overfit
  degil, genis bir olasilik kutlesi.
- `archive-retest.js` zaten her kayitta (kultistsiz dahil) seed taramasi
  yapiyor; uretim akisi degisiklik istemiyor.
- `harness.js`'teki "kultist yoksa tek seed" kisayolu kaldirildi (yama
  kultistsiz savaslari da seed'e bagimli yapabiliyor).
- Uygulama: `battle-core.js` -> `roundDamageByMode` legacy dalinda,
  mevcut ozel durumlar (wraith tek sayi, bats-vs-dev raund 1 round())
  korunarak, sadece varsayilan ceil yolunda: muttefik + tam .5 kesir ->
  `rng() < 0.5 ? floor : ceil`. RNG yalnizca ana saldiri cagrisindan
  geciriliyor (splash yollari degismedi).

## 4. Kalan 6 Vaka Icin Bulgular

`#1(kat7) #2(kat8) #4(kat10) #7(kat15) #8(kat19) #11(kat39)`

- **#2**: Simulat motoru (minified, muhtemelen gercek oyundan) birebir
  buluyor. Iki aday mekanik test edildi:
  - *Banshee Ambush* (simulat'ta banshee raundun ilk birimi olunca x1.2):
    10 dogruyu bozdu, #2'yi de duzeltmedi -> gercek oyunda yok, simulat
    fazlasi (simulat tum arsivde zaten sadece 1.646/1.946 tutturuyor).
  - *necroBuffEscalatesPerRound* bayragi (olu grup basina her raund +%10
    yeniden ekleme): 1.946/1.946 + #2 duzeliyor AMA mekanik cifte sayim
    iceriyor (battle-core olay bazli +%10'u zaten uyguluyor) ve simulat'in
    kendisinde eskalasyon yok -> seed uzayini kaydirarak tesadufen
    eslesme riski yuksek, **uygulanmadi**. Ileride benzer vakalar birikirse
    yeniden degerlendirilebilir.
- **#1/#4/#7**: T8 (ve #4'te T2) kaybi eksik; .5 yazi-tura tetiklenmiyor
  (banshee sayilari cift, kesir cikmiyor) veya yetmiyor. 2026-06-10
  raporundaki banshee debuff zamanlamasi suphesi gecerliligini koruyor;
  oyun ici kontrollu olcum hala en saglam yol.
- **#8**: Desen disi (dusman hasari farkli cepheye dagilmis); ayri mekanik.
- **#11**: Karsilikli tam yok olusta kazanan kurali; kayiplar birebir ayni,
  yalnizca kazanan farkli. Benzer vakalar biriktikce cozulur.

## 5. Degisen Dosyalar

- `battle-core.js` — legacy modda tam .5 kesirli muttefik hasari seed'li
  yazi-tura (~10 satir).
- `tests/test-half-fraction-random-rounding.js` — yeni regresyon testi
  (fail #3 gercek sonucu bulunmali + kat2#5 dogrusu korunmali).
- `_web-disi/sim-research-20260610/harness.js` — tek-seed kisayolu kaldirildi.
- `_web-disi/sim-research-20260611/` — yeni arac seti: mode-survey
  (mod karsilastirma), mode-harness (tum arsiv tek modla), diffmode
  (iki modun log diff'i), inspect-rec (pass/fail kayit logu),
  determinism-stats (yazi-tura etki olcumu), case2-compare (simulat vs
  legacy log karsilastirma), battle-core-flags + search (yeni bayraklar:
  *HalfRandom*, *Floor* varyantlari, bansheeAmbush*, vb.).

## 6. Dogrulama

- Harness: **1946/1946 + 5/11** ✓
- Tum testler (9/9) gecti ✓
