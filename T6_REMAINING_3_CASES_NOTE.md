# T6 Kalan 3 Vaka Notu

Tarih: `2026-04-29`

Bu dosya, `T6 / Gargoyle` ile ilgili arastirma sonunda hala tam aciklanamayan `3` vakayi ayri toplamak icin hazirlandi.

## Ozet

- Canli taramada `wrong.html` tarafinda `17` kayit vardi
- Canli taramada `saved.html` tarafinda `46` kayit vardi
- `saved` tarafi, sakli temsilci `seed` ile `46/46` uyumlu cikti
- `wrong` tarafi, tarama anindaki motor davranisiyla `14/17` uyumlu gorundu
- Kalan `3` vaka T6 ile iliskili gorunuyor
- Ortak desen:
  - motor `Gargoyle` kaybini eksik sayiyor
  - buyuk vakada buna ek olarak `Bat` kaybi da eksik

Onemli not:
- O donemde `wrong` kayitlarinda `seed` saklanmiyordu
- Bu yuzden `14/17` sayisi tamamen deterministik bir metrik degildi
- Yine de arastirma icin guclu yon gosteren bir snapshot oldu

## 14/17'ye Ne Ile Gelindi

Asil duzeltilen kural su oldu:

- `Zombie` dirildiginde, eski `Zombie` stack'inin yedigi `speed` debuff korunmali
- Kod duzeltmesi: dirilen zombie stack'ine eski zombie hizinin tasinmasi
- Bu, ozellikle `T6 + Zombie revive` etkilesimindeki hatalari kapatti

Bu duzeltme sonrasinda daha once dogrudan gozlenen etkiler:

- `wrong_1777417208432_0e4b4j9` duzeldi
- `wrong_1777417584490_jtys0za` duzeldi
- `wrong_1777417728351_4oifh1i` duzeldi

Canli taramada da genel olarak `wrong` tarafindaki buyuk grubun artik gercek sonuc alanina oturdugu goruldu. Ama asagidaki `3` vaka ayni kuralla aciklanamadi.

## Kalan 3 Vaka

### 1. `wrong_1777415591614_g7dc64p`

Rapor zamani:
- `2026-04-28T22:32:58.779Z`

Dusman:
- `T1 Iskelet 20`
- `T2 Zombi 27`
- `T3 Tarikatci 23`
- `T4 Kemik Kanat 11`
- `T5 Sismis Ceset 9`
- `T6 Hayalet 8`
- `T7 Hortlak 14`
- `T8 Kemik Dev 1`
- `T9 0`
- `T10 0`

Muttefik:
- `T1 Yarasa 27`
- `T2 Gulyabani 38`
- `T3 Vampir Kole 7`
- `T4 Bansi 15`
- `T5 Nekromant 1`
- `T6 Gargoyle 8`
- `T7 Kan Cadisi 0`
- `T8 Curuk Cene 0`

Bizdeki sonuc:
- `710 kan`
- kayip:
  - `9 Yarasa`
  - `38 Gulyabani`
  - `1 Nekromant`

Gercek sonuc:
- `785 kan`
- kayip:
  - `9 Yarasa`
  - `38 Gulyabani`
  - `1 Nekromant`
  - `1 Gargoyle`

Kalan fark:
- `+75 kan`
- `+1 Gargoyle`

Durum yorumu:
- `Zombie revive speed carryover` tek basina yeterli olmadi
- Son turda `Gargoyle` kaybi eksik hesaplanmis gorunuyor

### 2. `wrong_1777441496356_6fouf17`

Rapor zamani:
- `2026-04-29T05:44:42.532Z`

Dusman:
- `T1 Iskelet 15`
- `T2 Zombi 42`
- `T3 Tarikatci 17`
- `T4 Kemik Kanat 10`
- `T5 0`
- `T6 0`
- `T7 0`
- `T8 0`
- `T9 0`
- `T10 0`

Muttefik:
- `T1 Yarasa 30`
- `T2 Gulyabani 1`
- `T3 0`
- `T4 Bansi 9`
- `T5 Nekromant 1`
- `T6 Gargoyle 2`
- `T7 0`
- `T8 0`

Bizdeki sonuc:
- `65 kan`
- kayip:
  - `1 Gulyabani`
  - `1 Nekromant`

Gercek sonuc:
- `215 kan`
- kayip:
  - `1 Gulyabani`
  - `1 Nekromant`
  - `2 Gargoyle`

Kalan fark:
- `+150 kan`
- `+2 Gargoyle`

Durum yorumu:
- Burada da kazanan taraf ayni
- Ama `Gargoyle` kaybi tamamen eksik sayiliyor

### 3. `wrong_1777454090042_59ekfny`

Rapor zamani:
- `2026-04-29T09:11:59.653Z`

Dusman:
- `T1 Iskelet 21`
- `T2 Zombi 13`
- `T3 Tarikatci 18`
- `T4 Kemik Kanat 9`
- `T5 Sismis Ceset 18`
- `T6 Hayalet 6`
- `T7 Hortlak 8`
- `T8 Kemik Dev 7`
- `T9 Yavrulayan Ana 6`
- `T10 0`

Muttefik:
- `T1 Yarasa 43`
- `T2 Gulyabani 45`
- `T3 Vampir Kole 32`
- `T4 Bansi 3`
- `T5 Nekromant 1`
- `T6 Gargoyle 9`
- `T7 Kan Cadisi 0`
- `T8 Curuk Cene 0`

Bizdeki sonuc:
- `1010 kan`
- kayip:
  - `18 Yarasa`
  - `45 Gulyabani`
  - `3 Bansi`
  - `1 Nekromant`

Gercek sonuc:
- `1440 kan`
- kayip:
  - `31 Yarasa`
  - `45 Gulyabani`
  - `3 Bansi`
  - `1 Nekromant`
  - `4 Gargoyle`

Kalan fark:
- `+430 kan`
- `+13 Yarasa`
- `+4 Gargoyle`

Durum yorumu:
- Bu en zor vaka
- Burada sadece `Gargoyle` degil, `Bat` kaybi da eksik
- Fark birden fazla tur boyunca zincirleme bir hedefleme / sira etkisine isaret ediyor

## Bu 3 Vakada Ortak Gorulen Desen

- `Gargoyle` kaybi tum vakalarda eksik
- Kalan farklar basit bir `rounding` sorunu gibi gorunmuyor
- Kazanan taraf degismiyor, ama savas yolu degisiyor
- Sorun buyuk ihtimalle `T6` etkisinin eksik modellenmis ikinci bir parcasi

## Denenen Aciklama 1: Zombie Revive Sonrasi Hiz Mirası

Bu neyi duzeltti:
- dirilen `Zombie` stack'i, onceki `Zombie` stack'inin yedigi `slow` etkisini koruyor

Bu neden onemliydi:
- `T6` reactive slow etkisi, `Zombie` dirildikten sonra kaybolmamaliydi

Bu neyi cozemedi:
- yukaridaki `3` vaka, sadece bu kural ile tam sonuca ulasmadi

## Denenen Aciklama 2: T6 Raund Basi Ek Slow

Brute-force seviyesinde su model denendi:

- `Gargoyle` hayattaysa, her raund basinda bir dusman stack'ine `-2 speed` uygulanir
- Bu etki, `Gargoyle`e vurana verilen mevcut `reactive slow` etkisinden ayri dusunuldu

Bu model neden ciddiye alindi:
- kalan `3` vakanin ucunu de dogru hedef secimiyle birebir aciklayabiliyor

Bulunan hedef dizileri:
- `wrong_1777415591614_g7dc64p`
  - `[corpses, revenants, zombies|corpses|revenants|giants]`
- `wrong_1777441496356_6fouf17`
  - ilk raund `skeletons` slow yeterli
- `wrong_1777454090042_59ekfny`
  - `[corpses, broodmothers, giants]`

Bu ne anlatiyor:
- ikinci eksik kural buyuk ihtimalle gercekten `T6 round-start slow`
- ama asil bilmedigimiz sey `hedefin nasil secildigi`

## Neleri Sistematik Olarak Denedik

### A. Mevcut motor

Model:
- sadece mevcut `reactive-only T6`

Sonuc:
- `saved`: `46/46`
- `wrong`: snapshot bazli `14/17`

Eksik kalanlar:
- bu dosyadaki `3` vaka

### B. Round-start random slow

Model:
- raund basi random bir dusman stack'ine `-2 speed`

Sonuc:
- `saved`: yaklasik `33/46`
- `wrong`: yaklasik `16/17`

Yorum:
- kalan vakalari aciklamaya yaklasiyor
- ama daha once dogru olan bircok `saved` kaydi bozuyor

### C. Round-start random slow + reactive slow

Model:
- hem mevcut reactive slow
- hem de round-start random slow

Sonuc:
- `saved`: yaklasik `39/46`
- `wrong`: yaklasik `16/17`

Yorum:
- yine yeterince guvenli degil

### D. Deterministic heuristic taramasi

Denenen hedefleme turleri:
- `speed`
- `count`
- `health`
- `attack`
- `index`
- artan / azalan varyantlari
- `front` / `rear` kisitlari

Sonuc:
- hicbir basit heuristic `46/46 saved` ve `17/17 wrong` sonucunu ayni anda vermedi
- en iyi deterministic adaylardan biri:
  - yaklasik `42/46 saved`
  - yaklasik `16/17 wrong`

### E. Basit kosullu acma denemeleri

Denenen kosullar:
- `enemy_zombies`
- `enemy_corpses`
- `enemy_giants`
- `gargoyles_ge_8`
- benzeri basit acma / kapama kosullari

Sonuc:
- en iyi sonuc yaklasik:
  - `44/46 saved`
  - `15/17 wrong`

Yorum:
- `wrong` tarafini iyilestiren her model, `saved` tarafinda regresyon uretti

## Buyuk Vakadaki Ek Not

`wrong_1777454090042_59ekfny` icin ek tekrarlar yapildi:

- mevcut reactive-only model ile ayni roster tekrar calistirildiginda farkli sonuclar uretebildi
- sebep:
  - o tarihte `wrong` kayitlarinda `seed` yoktu
  - motor seed verilmezse random akis tekrar olusuyordu

Gozlenen ornekler:
- bazen `1010`
- bazen `1235`
- gercek kayit `1440`

Ek arastirma:
- round-start slow acikken `1..5000` seed araliginda gercek `1440` sonucu uretebilen seed bulundu
- ilk bulunan seed: `2847`
- ama bu cok nadir goruldu

Yorum:
- bu, dogru yone bakildigini gosteriyor
- ama kural hala fazla kaba

## Neden Hala Cozulmedi

Su anki en guclu teknik sonuc:

- sorun buyuk ihtimalle `T6`nin eksik modellenmis ikinci etkisi
- bu ikinci etki buyuk ihtimalle `raund basi slow`
- fakat `slow` hedef secimi saf random degil
- basit deterministic kural da degil
- muhtemelen:
  - belirli hedef onceligi
  - pozisyon etkisi
  - ya da oyuna ozgu baska gizli bir secim kuralı var

## Bundan Sonra Ne Yapilmali

En mantikli sonraki adimlar:

1. `wrong` kayitlarinda her zaman `seed` saklamak
2. Mümkünse ayni savas icin birden fazla gercek ornek toplamak
3. Bu `3` vaka icin yeni gercek kayitlar geldikce tekrar taramak
4. `T6` hedef secim kuralini daha buyuk ornekle yeniden kurmak

## Son Karar

Bugun itibariyla guvenli sekilde uygulanabilecek ikinci bir `T6` kuralı bulunamadi.

Uygulanan ve kalici kalan duzeltme:
- `Zombie revive speed inheritance`

Uygulanmayan ama guclu hipotez:
- `T6 round-start slow target selection`

Bu dosyadaki `3` vaka, bu ikinci kurali cozmek icin referans ana vakalar olarak tutulmali.
