# Simulator Arastirma Raporu - 2026-06-11

> **Guncelleme (ayni gun, 2. oturum):** Yazi-tura yamasi birim-basina binom
> modeline genisletildi; toplam **7/11 yanlis duzeldi** (1946/1946 korundu).
> Ayrinti: Bolum 7-8.

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

## 6. Dogrulama (1. oturum)

- Harness: **1946/1946 + 5/11** ✓
- Tum testler (9/9) gecti ✓

---

## 7. Ikinci Oturum: Birim Basina Binom Modeli (7/11)

Kalan 6 vaka 65.536 seed ile tarandi: **hepsi tek bir sonuc uretiyordu** —
yani gurultu degil, deterministik mekanik farklari. Inject taramasi
(`inject-scan2.js`: hangi raundda/kimden/kac puan ekstra hasar gercek sonucu
uretir?) her vakayi yerellestirdi:

- **#7**: R1'de 12 kultist salvosu 67.5→68 vuruyor, rotmaw 5 canla kurtuluyor;
  gercek icin salvo ≥73 olmali → banshee R1'de 7 yerine ≤6 vurmus olmali
  (2 banshee × 3.5; en az biri asagi yuvarlanmis).
- **#8**: R1'de 7 banshee 24.5→25 ile 23 kultisti tek vurusta siliyor; gercekte
  kultistler sag kalip cepheyi yemis → banshee toplami ≤22 olmali
  (7 birimin ≥6'si asagi).
- **#2**: zombileri raundun son aktoru rotmaw bitiriyor (dirilenler vurusamadan
  banshee'ye yem oluyor); gercekte dirilenler ayni raund rotmaw + nekromanti
  oldurmus → banshee hasar varyansi zamanlamayi kaydirabilmeli.

Uc vaka da ayni modele isaret etti: **birim basina tam .5 kesirli hasarda her
birim bagimsiz yazi-tura atar (binom dagilimi).** Toplam-üstu tek yazi-tura
bunun n=1 ozel hali. 7 banshee × 3.5 = [21..28] arasi dagilir; tek coin
yalnizca 24/25 uretirdi.

| Model | Dogru | Duzelen |
|---|---:|---:|
| Tek yazi-tura (1. oturum) | 1.946 | 5/11 |
| **Birim basina binom (muttefik)** | **1.946** | **7/11** (#2, #7 eklendi) |
| Birim basina binom (iki taraf) | 1.946 | 7/11 (ayni; determinizm daha gevsek) |

Determinizm olcumu (muttefik modeli): 606 dogru tamamen deterministik,
tum eslesmeler ilk 16 seed icinde, ortalama seedlerin %83.5'i eslesiyor,
kirilgan (<=8/256) vaka sifir. Uygulama: `battle-core.js` legacy dalinda
birim basina binom; `tests/test-half-fraction-random-rounding.js` #2 ve #7
asersiyonlariyla genisletildi.

## 8. Denenen ve Elenen Diger Hipotezler (2. oturum)

| Hipotez | Dogru | Duzelen | Karar |
|---|---:|---:|---|
| Banshee Ambush ×1.2 (simulat'tan; ilk saldiran bonusu) | 1.936 | +0 | 10 dogru bozuyor, #2'yi de cozmuyor; simulat fazlasi |
| Ambush + Math.round yuvarlama | 1.936 | +0 | Ayni 10 bozuk |
| necroBuffEscalatesPerRound | 1.946 | +1 (#2) | Cifte sayim iceriyor, simulat'ta da yok; binom modeli #2'yi ilkeli sekilde cozunce gereksizlesti |
| Banshee debuff kapsama orani (banshee/hedef) | 1.901 | +1 (#7) | 45 dogru bozuyor |
| Banshee debuff rastgele (%50/saldiri) | 1.946 | +1 (#7) | Bozmuyor ama anlamsal temeli zayif; binom modeli #7'yi zaten cozdu |
| Dirilen sayimi 1 HP (+ambush) | 1.682 | +1 | /7 sayimi 263 dogru tarafindan kilitli |

## 9. Kalan 4 Vaka: Guncel Anatomiler

- **#1 (kat7)**: Gercek tam 1 gulyabani + rotmaw kaybi; ulasilabilir sonuc
  uzayinda 0 ya da 2 gulyabani var, 1'i yok (262k seed). Dusman tarafi binom
  (iskelet 1.5/birim) yaklastiriyor ama 32k seedde tam eslesme yok.
- **#4 (kat10)**: Rotmaw'a R1-R3'te +11 dusman hasari gerek (inject ile birebir
  dogrulandi); muttefik varyansi hicbir sonucu degistirmiyor (262k seedde tek
  sonuc). Dusman tarafi binomla rotmaw olu dala ulasiliyor (150 kan) ama 2
  gulyabani kaybi eksik.
- **#8 (kat19)**: Kultistlerin R1'de sag kalmasi sart (banshee ≤22, p≈%6);
  sag kaldiklari dalda bile gercek desen (T2x2,T3x4,T4x4,T5,T6; yarasalar sag)
  uretilemiyor — yarasalar hep oluyor (415 kan dali). Hedef secimi + dusman
  varyansi karisimi gerekiyor.
- **#11 (kat39)**: Kazanan kurali degil! Simde dusman 32 iskelet + 3 mezar
  dehseti ile sag kaliyor. Kritik an: R3'te 34 yarasa 272 hasari 15 canlik
  dirilenlere harciyor (257 overkill cope), 128 canlik iskelet beklerken.
  Iki tarafli binomda ilk kez muttefik zaferi dali acildi (194/32768) ama
  yarasalar sag kaliyor (1165 kan, gercek 1505). Hedef secimi süphesi guclu;
  frontOrder varyantlari daha once yuzlerce dogru bozdugu icin dar bir kosul
  gerekli.

Dusman tarafi binom (`perUnitHalfRandomBoth` bayragi) 1946/1946 koruyor ve
#1/#4/#11'i yaklastiriyor; tam eslesme saglamadigi icin uygulanmadi, gelecek
icin en guclu aday.
