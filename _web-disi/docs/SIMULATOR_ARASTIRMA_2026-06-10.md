# Simulator Arastirma Raporu - 2026-06-10

## Ozet (TL;DR)

`test-sonuclari-1-40` arsivindeki kalan **18 yanlis** savas incelendi. Kok hata
bulundu: **Kan Cadisi'nin 0 hasarli vurusu, dirilen zombilerin birim sayisini
yanlislikla yeniden hesaplatip 29 birimi 5 birime dusuruyordu.** Tek kosulluk
bir duzeltmeyle (`attackerDamage > 0` kontrolu):

| Kume | Once | Sonra |
|---|---:|---:|
| Dogrular | 1.946 / 1.946 | **1.946 / 1.946** (hicbiri bozulmadi) |
| Yanlislar | 0 / 18 | **8 / 18 duzeldi** |

Duzelen vakalar: `#7, #8, #9, #11, #12, #14, #16, #17`. Duzeltme canliya
deploy edildi. Kalan 10 vaka icin bulgular ve oneriler asagida.

---

## 1. Baslangic Durumu ve Amac

Onceki calisma (`SIMULATOR_ARASTIRMA_2026-06-09.md`) Rotmaw overkill hedef
secimindeki eksik parametreyi duzeltmis, 79 yanlisin 62'sini cozmustu. Geriye
18 yanlis savas kalmisti (kullanici yeni testlerle guncel listeyi cikardi).

Hedef her zamanki gibi cift tarafli:

1. Yanlis sonuclanan savaslari duzeltmek,
2. **1.946 dogru savasin hicbirini bozmamak** (koruma esigi).

Bu ikinci sart cok onemli cunku 1.946 dogru savas, motorun mevcut kurallarini
cok siki sinirlandiriyor: "genel" bir kural degisikligi neredeyse her zaman
yuzlerce dogruyu bozuyor. Dogru duzeltme, ancak gercek motordaki gercek bir
hataya denk gelirse iki sarti birden saglayabiliyor.

## 2. Kurulan Deney Duzenegi

Her hipotezi hizla ve guvenle test edebilmek icin `_web-disi/sim-research-20260610/`
altinda bir arac seti kuruldu:

- **`harness.js`** — Arsivdeki tum kayitlari (8 pass dosyasi + 1 fail dosyasi)
  parse edip motoru yeniden oynatir; `archive-retest.js` ile ayni es kriterini
  kullanir: *kazanan + toplam kan kaybi + birim bazinda kayip sayilari* tam
  eslesmeli. Kultist rastgeleligi icin yanlislarda 1.024, dogrularda 256 seed
  taranir (kultist yoksa savas deterministik, tek seed yeter). Tum arsiv ~2
  saniyede kosar — bu hiz, onlarca hipotezin denenebilmesini sagladi.
- **`battle-core-flags.js`** — Motorun, davranis varyantlarini bayraklarla
  (`__SIM_FLAGS__`) acip kapatabilen kopyasi. Boylece her hipotez uretim
  koduna dokunmadan test edildi.
- **`search.js`** — Bayrak kombinasyonlarini toplu tarayip her biri icin
  "kac dogru korundu / kac yanlis duzeldi / hangi dogrular bozuldu" raporu verir.
- **`inspect.js` / `inspect2.js`** — Tek bir savasin hamle hamle tam logunu
  basar; baseline ile varyant loglari `diff`lenerek sapmanin tam yeri bulunur.
- **`shortfall.js` / `t8-survey.js`** — Istatistik araclari (asagida).

Ilk kosum referansi dogruladi: mevcut motor **1946/1946 + 0/18**.

## 3. Desen Analizi: Yanlislar Ne Soyluyor?

18 yanlisin yapisi cikarildi:

- **12 vakada** ortak imza: simulator, gercekte olen **T8 Curuk Girtlak x1**
  kaybini (-150 kan) hesaplamiyor. Cogunda diger kayiplar birebir tutuyor.
- **#13/#15**: T8'e ek olarak buyuk yarasa kayiplari da eksik (T1 x19 / x22).
- **#10**: T8 sag (dogru) ama dusman hasari T2/T3/T4/T6'ya dagilmis olmali;
  simde tek kayip T5.
- **#18**: Iki taraf da tamamen yok oluyor; kayiplar ve kan birebir ayni,
  yalnizca **kazanan** farkli (gercekte zafer, simde maglubiyet).

`shortfall.js` ile her vakada T8'in savas sonunda kac canla "kurtuldugu"
olculdu: 2 ile 40 arasinda degisiyor. Yani sorun sabit bir yuvarlama farki
degil; **gercek savasta dusman bir sekilde belirgin olcude daha fazla hasar
vurmus**. Eksik hasar miktarinin degiskenligi, eksik bir *mekanik* aradigimizi
gosterdi.

Iki onemli ipucu daha:

1. **#13'un eksik yarasa kaybi matematiksel olarak tam oturuyor:**
   19 yarasa = 13 Kemik Kanat × 6 atk × 0.5 = 39 hasar (yarasa 2 can).
   #15'te 22 yarasa = 15 × 6 × 0.5 = 45. Yani gercek savasta Kemik Kanat
   **tam kadro bir tur daha** saldirmis; simde o firsati bulamiyor.
2. **"Hasarli sag kalan T8 olu sayilsin mi?" hipotezi veriyle curutuldu:**
   `t8-survey.js` ile 1.899 rotmaw'li dogru savas tarandi; gercekte T8'in sag
   sayildigi savaslarin **302'sinde** sim T8'i 1 canla bitiriyor. Demek ki
   "az canla kurtulan T8" tamamen normal; yanlislardaki sorun bu degil.

## 4. Donum Noktasi: Dirilen Zombi Izleri

Genel taramada `reviveUntargetable` (dirilen zombiler dirildigi raund hedef
alinamasin) bayragi 18 yanlisin **11'ini** duzeltti — acik ara en guclu sinyal.
Ama 1.044 dogruyu bozdu; cunku dogru savaslarin bircogunda muttefiklerin
dirilenleri ayni raund vurmasi *gerekiyor* (orn. kat1#1'de Banshee dirilenleri
o raund oldurmek zorunda, yoksa sonuc sapiyor).

Bu celiski "kural hedeflemede degil, baska bir yerde" dedirtti. Duzelen 11
vakanin sim loglarinda dirilenlere ilk vuran birim tek tek cikarildi ve kritik
oruntu gorundu: birebir ayni imzali 7 vakalik kumede (#7, #8, #9, #11, #12,
#14, #16) dirilenlere ilk dokunan **hep Kan Cadisi (T7)**.

#8'in tam logu buyutec altina alindi ve hata yakalandi:

```
RAUND 2 (cift raund)
  Kan Cadisi (T7) -> Diriltilmis Zombiler
     Hesap: ... = 0 hasar (cadi cift raundda ana hedefe hasar vurmaz)
     -> Diriltilmis Zombiler: 24 birim kaybetti, 5 birim / 29 can kaldi   <-- !!!
```

**0 hasarli vurusa ragmen 24 birim "kaybolmus".** Sebep: motor, dirilen
zombilerin birim sayisini her vurusta `ceil(kalanCan / 7)` ile (orijinal Zombi
cani 7 uzerinden) yeniden hesapliyor. Dirilenler 29 birim × 1 can = 29 can ile
doguyor; cadinin 0 hasarli vurusu bu yeniden hesabi tetikleyince 29 can,
"7 canlik kovalara" bolunup `ceil(29/7) = 5` birime dusuyor. Sonra dirilenler
sirasi geldiginde 29 yerine **5 birimle** saldiriyor.

Dogrulama birebir:

- #8: T8'in simde artakalan cani **24** = (29 − 5) birim × 2 atk × 0.5
- #9: T8'in artakalan cani **19** = (23 − 4) × 2 × 0.5 (cadi tek raundda 7
  hasar vurmus, 30−7=23 can; `ceil(23/7)=4`)

Yani eksik hasar, tam olarak "kaybolan" dirilen birimlerinin vuramadigi hasar.

### Neden `ceil(can/7)` hesabinin kendisine dokunulmadi?

Ilk akla gelen "madem dirilenler 1 canlik, sayimi 1 ile yap" duzeltmesi
(Codex'in de deneyip eledigi fikir) test edildi: 8 yanlisi duzeltiyor ama
**263 dogruyu bozuyor**. Ornek kat2#3: gulyabani dirilenlere 3 hasar vurunca
gercek oyun davranisi 13 dirilenin 2 birim gucunde saldirmasiyla eslesiyor —
yani `ceil(10/7)=2` davranisi *gercek*. Sorun bu mekanik degil; sorun, bu
mekanigin **hasar 0 iken de** tetiklenmesi. Gercek oyun 0 hasarli vurusu hic
islemiyor olmali. Hata tam buradaydi ve duzeltme tek kosul:

```js
if (defenderIndex === REVIVED_INDEX) {
  if (unitHealth[defenderIndex] <= 0) {
    unitNumbers[defenderIndex] = 0;
  } else if (attackerDamage > 0) {   // <-- yeni kosul
    const baseHp = UNIT_DESC[ZOMBIES_INDEX][HEALTH_INDEX];
    unitNumbers[defenderIndex] = Math.ceil(unitHealth[defenderIndex] / baseHp);
  }
}
```

Sonuc: **1946/1946 korundu, 8/18 duzeldi, sifir yan etki.** (#17'yi de
duzeltmesi bonus oldu: o vakada da ayni mekanizma zincirin halkasiydi.)

## 5. Denenen ve Elenen Tum Hipotezler

Her satir `search.js` ile tum arsive karsi olculdu:

| # | Hipotez | Gerekce | Dogru | Duzelen | Karar |
|---|---|---|---:|---:|---|
| 1 | Dirilenler dogdugu raund hedeflenemez | 11 vakada dirilenlerin sag kalip T8'i vurmasi gerekiyor | 902 | 11/18 | Cok agresif; dogrularda muttefik dirilenleri ayni raund vurmali |
| 2 | Dirilenler "son oncelik" (baska hedef yoksa secilir) | 1 nolu hipotezi yumusatmak | 1.284 | 11/18 | Hala cok agresif |
| 3 | Dirilen sayimi 7 yerine 1 HP ile | 1 canlik birimler 7'lik kovaya dusmesin | 1.683 | 8/18 | 263 dogru /7 davranisina dayaniyor; mekanik gercek |
| 4 | **Sifir hasarli vurusta sayim atlanir** | Cadinin 0 hasari sayimi tetiklememeli | **1.946** | **8/18** | **UYGULANDI** |
| 5 | Banshee debuff tamamen kapali | #2/#5/#6/#13/#15'te debuffsuz hasarlar tutuyor | 1.869 | 13/18 | 77 dogru ayni debuffa muhtac |
| 6 | Banshee debuff sonraki raund etkili | Zamanlama farki olabilir | 1.873 | 13/18 | 73 dogru bozuluyor; ayrim bulunamadi |
| 7 | Banshee debuff hem o raund hem sonraki | Iki dunyayi birlestirme denemesi | 1.946 | 8/18 | Zarar yok ama fayda da yok |
| 8 | Banshee hasari asagi yuvarlansin (floor) | 3.5→3 olursa kalan kultist sayisi degisiyor | 1.692 | 11/18 | 254 dogru bozuluyor |
| 9 | Esit hizda dusman cephesi muttefik cephesinden once | #13'te Iskelet, Gargoyle olmeden T8'i vurmali | 1.041 | 3/18 | #13/#15'i birebir cozuyor ama 905 dogru bozuluyor |
| 10 | Cephe sirasi birim-can artan (Iskelet 4 < Gargoyle 12) | 9'un dar hali | 1.379 | 2/18 | 567 dogru bozuluyor |
| 11 | Cephe sirasi dinamik: birim sayisi / toplam atk / toplam can | kat2#4 (1v1) ile #13 (18v4) celiskisini cozme denemesi | 1.151–1.445 | 2–3/18 | Hepsi yuzlerce dogru bozuyor |
| 12 | Hasar birim basina ceil (toplam yerine) | Israrli "1 can kisa" sapmalari | 880 | 9/18 | 1.066 dogru bozuluyor; toplam-ceil kesin |
| 13 | T8'e karsi tip avantaji/dezavantaji islemesin | "Rotmaw tipi onemsemez" cift yonlu olabilir | 245 | 0/18 | Kesinlikle hayir |
| 14 | Okult muttefikler dirilenleri hedefleyemez | #13'te T3 atlamali, kat1#1'de T4 vurmali — tip ayrimi? | 1.812 | 9/18 | 134 dogru bozuluyor |
| 15 | Kultist buffi birim basina (22 kultist = 22 buff) | Buyuk kultist gruplari daha etkili olabilir | 1.946 | 0/18 | Etkisiz |
| 16 | Dirilenler, Zombi yiginin kultist buffini miras alir | #2'de eksik +3 hasari kapatabilirdi | 1.946 | 0/18 | Etkisiz (zarari da yok) |
| 17 | Hasarli sag T8 kayip sayilsin | 16 vakada T8 az canla kurtuluyor | — | — | Veri curuttu: 302 dogruda T8 1 canla sag ve gercekte kayip degil |

Tablodaki ortak ders: **pass kumesi cok siki bir referans.** Saldiri sirasi,
yuvarlama bicimi ve hedef secimi kurallarinin tamami 1.946 dogru tarafindan
"kilitlenmis" durumda; bunlara dokunan her genel degisiklik yuzlerce dogruyu
bozuyor. Gercek ilerleme ancak dar, kosullu, gercek bir bug'a denk gelen
duzeltmelerle mumkun (once Rotmaw parametresi, simdi 0-hasar sayimi).

## 6. Dogrulama ve Deploy

- Tum arsiv yeniden kosuldu: **1946/1946 + 8/18** ✓
- Yeni regresyon testi eklendi: `tests/test-revived-zero-damage-recount.js`
  (#8 vakasi, seed 0: muttefik zaferi, 200 kan, T5 x1 + T8 x1) ✓
- Mevcut testler: rotmaw overkill, rounding policy, battle log unit summary,
  unit names — hepsi gecti ✓
- `git diff --check` (CRLF uyumlu) temiz; degisiklik 5 satir ekleme / 3 silme ✓
- Commit `96009cd` + `firebase deploy --only hosting` → canli dogrulandi
  (https://bt-analiz.web.app/battle-core.js icinde yama mevcut) ✓

## 7. Kalan 10 Vaka: Ne Biliyoruz?

```text
#1(kat7) #2(kat8) #3(kat8) #4(kat10) #5(kat14) #6(kat15)
#10(kat19) #13(kat20) #15(kat20) #18(kat39)
```

- **#1–#6 (T8 2–8 can ile kurtuluyor):** Banshee debuff zamanlamasi en guclu
  aday — "sonraki raund" varyanti besini birden duzeltiyor ama ayni kurala
  muhtac 73 dogruyla celisiyor. kat2#7 (dogru) ile #2 (yanlis) neredeyse ayni
  sahneyi yasiyor (banshee kultisti vuruyor, kalan kultist muttefiki vuruyor)
  fakat birinde debuff uygulanmali, digerinde uygulanmamali. Bu ayrimi
  yapacak kosul bulunamadi; oyundan tek raundluk kontrollu bir savasla
  debuff suresini olcmek gerekiyor.
- **#13/#15 (eksik yarasa + T8):** Eksik kayip birebir Kemik Kanat'in tam
  kadro bir turuna esit. "Esit hizda Iskelet, Gargoyle'dan once davranir"
  kurali vakayi birebir cozuyor; ancak ayni kural kat2#4'te (1 Iskelet vs
  1 Gargoyle) tersini istiyor. Sira kuralinin gizli bir bileseni var ama
  eldeki veriyle tek basina cozulemedi; raund bazli gercek log sart.
- **#10:** Tum desenin disinda tek vaka — dusman hasari T8'e degil obur
  cepheye dagilmis. Hedef secimi ("en yavas one") kuralina aykiri; ayri bir
  mekanik ariza olarak incelenmeli.
- **#18:** Karsilikli tam yok olusta kazanan kurali. Kayiplar/kan birebir
  ayni; yalnizca sunucunun beraberlik kararini bilmiyoruz. Benzer vakalar
  biriktikce cozulur.

## 8. Sonraki Calisma Icin Oneriler

1. Banshee'li, tek raundda bitecek kontrollu bir savasla debuffin suresini
   (ayni raund mi, sonraki raund mi, tek saldiri mi) oyundan dogrula.
2. #13/#15 tipi bir savasin oyun ici raund/hamle logu alinabilirse esit hiz
   sira kurali kesinlesir.
3. #18 benzeri "iki taraf da yok oldu" savaslarini arsivde isaretleyip
   biriktir; kazanan kuralini veriden cikar.
4. Her yeni denemede koruma esigi: `node _web-disi/sim-research-20260610/harness.js`
   ile **1946/1946** + mevcut testler. Yeni hipotezler `search.js`'e bayrak
   olarak eklenip ayni sekilde taranabilir.

## 9. Degisen Dosyalar

- `battle-core.js` — sifir hasarli vurusta dirilen sayimi atlanir (5+/3-).
- `tests/test-revived-zero-damage-recount.js` — yeni regresyon testi.
- `_web-disi/sim-research-20260610/` — deney duzenegi: harness (arsiv
  yeniden oynatma), search (bayrak taramasi), inspect/inspect2 (savas logu),
  shortfall & t8-survey (istatistik), battle-core-flags (bayrakli motor).
