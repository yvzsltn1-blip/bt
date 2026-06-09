# Simulator Arastirma Raporu - 2026-06-10

## Amac

`test-sonuclari-1-40` arsivindeki kalan `18` yanlis savasi, `1.946` dogruyu
bozmadan duzeltmek. (Onceki calisma: `SIMULATOR_ARASTIRMA_2026-06-09.md`,
Rotmaw overkill parametre duzeltmesi ile 79 yanlisin 62'si cozulmustu.)

## Kullanilan Veri ve Yontem

- Dogru savas: `1.946` (sekiz pass dosyasi, kat 1-40)
- Yanlis savas: `18` (`test-sonuclari-fail-kat1-40-tumu18-20260609-2359.txt`)
- Es kriteri archive-retest ile ayni: kazanan + toplam kan + birim bazli kayip,
  Kultist rastgeleligi icin yanlislarda `1.024`, dogrularda `256` seed taramasi.
- Deney duzenegi: `_web-disi/sim-research-20260610/` (harness.js, search.js,
  inspect.js, bayrakli motor kopyasi battle-core-flags.js).

## Bulunan Kok Hata

`18` yanlisin `8`'inde ortak zincir su:

1. Zombi grubu yok edilince her biri `1` canla geri diriliyor (orn. 29 birim / 29 can).
2. Kan Cadisi cift raundlarda ana hedefe `0` hasar vurur (yalnizca yayilma hasari).
3. Motor, bu `0` hasarli vurusta bile dirilen grubun birim sayisini
   `ceil(can / 7)` ile (orijinal Zombi cani uzerinden) yeniden hesapliyordu:
   `29 birim / 29 can` hic hasar almadan `5 birim / 29 can` oluyordu.
4. Dirilenler sirasi geldiginde `29` yerine `5` birimle saldiriyor, en yavas
   cephe birimi olan Curuk Girtlak (T8) eksik hasar aliyor ve simulasyonda
   sag kaliyordu (gercekte oluyor).

Dogrulama: #8 vakasinda T8'in sim sonu cani `24` = `(29 - 5) × 2 atk × 0.5`;
#9'da `19` = `(23 - 4) × 2 × 0.5` — eksik hasar birebir bu formulle aciklandi.

`ceil(can / 7)` yeniden hesabinin kendisi dokunulmadi: `1.946` dogrunun bir
kismi (orn. kat2#3) tam olarak bu davranisa dayaniyor; `1 HP` ile saymak
`263` dogruyu bozuyor. Hata yalnizca `hasar = 0` iken tetiklenmesiydi.

## Uygulanan Duzeltme

`battle-core.js` (REVIVED defender sayim blogu):

```js
if (defenderIndex === REVIVED_INDEX) {
  if (unitHealth[defenderIndex] <= 0) {
    unitNumbers[defenderIndex] = 0;
  } else if (attackerDamage > 0) {
    // Sifir hasarli vurus (cadi cift raund) dirilen sayimini yeniden hesaplatmaz
    const baseHp = UNIT_DESC[ZOMBIES_INDEX][HEALTH_INDEX];
    unitNumbers[defenderIndex] = Math.ceil(unitHealth[defenderIndex] / baseHp);
  }
}
```

## Sonuc

| Kume | Once | Sonra |
|---|---:|---:|
| Dogrular | 1.946 / 1.946 | 1.946 / 1.946 |
| Yanlislar | 0 / 18 | 8 / 18 |

Duzelenler: `#7, #8, #9, #11, #12, #14, #16, #17`
(kat 17, 19, 19, 19, 20, 20, 30, 31 — tamami Kan Cadisi iceren kadrolar).

Eklenen regresyon testi: `tests/test-revived-zero-damage-recount.js`
(#8 vakasi, seed 0: muttefik zaferi, 200 kan, T5 x1 + T8 x1).

Calistirilan dogrulamalar: tum arsiv (1946+18), rotmaw overkill testi,
rounding policy testi, battle log unit summary, unit names; hepsi gecti.

## Denenen ve Elenen Hipotezler

| Varyant | Dogru | Duzelen | Karar |
|---|---:|---:|---|
| Dirilenler dogdugu raund hedeflenemez | 902 | 11/18 | Cok agresif |
| Dirilenler son oncelik (soft) | 1.284 | 11/18 | Cok agresif |
| Dirilen sayimi 1 HP ile | 1.683 | 8/18 | Dogrular /7'ye dayaniyor |
| Banshee debuff kapali | 1.869 | 13/18 | 77 dogru bozuluyor |
| Banshee debuff sonraki raund | 1.873 | 13/18 | 73 dogru bozuluyor |
| Banshee hasari floor | 1.692 | 11/18 | 254 dogru bozuluyor |
| Esit hizda dusman cephesi once | 1.041 | 3/18 | 905 dogru bozuluyor |
| Cephe sirasi sayi/atk/HP bazli | 1.151-1.445 | 2-3/18 | Hayir |
| Birim basina ceil yuvarlama | 880 | 9/18 | Hayir |
| T8'e tip avantaji islemesin | 245 | 0/18 | Hayir |
| Okult muttefik dirileni hedefleyemez | 1.812 | 9/18 | 134 dogru bozuluyor |
| Kultist buff birim basina | 1.946 | 0/18 | Etkisiz |
| Dirilen, Zombi buffini miras alir | 1.946 | 0/18 | Etkisiz (bozmadi da) |
| Hasarli sag T8 kayip sayilsin | - | - | Veri curuttu (302 dogruda T8 1 canla sag) |

## Kalan 10 Vaka ve Gozlemler

```text
#1(kat7) #2(kat8) #3(kat8) #4(kat10) #5(kat14) #6(kat15)
#10(kat19) #13(kat20) #15(kat20) #18(kat39)
```

- `#1-#6`: T8 simde `2-8` can ile kurtuluyor; gercekte oluyor ve sonraki
  vuruslar diger birimlere gecip kucuk ek kayiplar (T2/T5) olusturuyor.
  Banshee debuff zamanlamasi (ayni raund / sonraki raund) tam bu vakalarin
  anahtari ama ayni kurala muhtac 73 dogru ile celisiyor; ayrim bulunamadi.
- `#13/#15`: Eksik yarasa kaybi birebir Kemik Kanat'in tam kadro bir tur
  saldirisina esit (13×6×0.5=39 → 19 yarasa; 15×6×0.5=45 → 22). Esit hizda
  Iskelet'in Gargoyle'dan once davranmasi vakayi birebir cozuyor fakat genel
  kural olarak 905 dogruyu bozuyor.
- `#10`: T8 sag kalmali ama dusman hasari T2/T3/T4/T6'ya dagilmis; hedef
  secimi "en yavas one" kuralina aykiri tek vaka. Ayri mekanik ariza.
- `#18`: Iki taraf da tamamen yok oluyor, kayiplar ve kan ayni, yalnizca
  kazanan farkli. Sunucunun es anli yok olusta kazanan kurali belirsiz.

## Sonraki Calisma Icin Oneri

1. Banshee debuffinin gercek suresini oyundan tek raundluk kontrollu bir
   savasla dogrula (debuff ayni raund mi, sonraki raund mi?).
2. #13/#15 icin raund bazli gercek log toplanirsa esit hiz sira kurali
   kesinlesir.
3. #18 benzeri "karsilikli yok olus" vakalari biriktirilirse kazanan kurali
   netlesir.
4. Koruma esigi: her degisiklikte `1.946/1.946` + yeni testler.

## Degisen Dosyalar

- `battle-core.js` — sifir hasarli vurusta dirilen sayimi atlanir (5+/3-).
- `tests/test-revived-zero-damage-recount.js` — yeni regresyon testi.
- `_web-disi/sim-research-20260610/` — deney duzenegi (harness, arama, log
  inceleme araclari); ileride yeni hipotez denemek icin hazir.
