# Wrong Battle Dataset Note

Bu dosya, `BT-Analyss - v6` icin gercek oyun sonucu ile simulator sonucu arasindaki farklari sistematik toplamak amaciyla olusturuldu.

Amac:
- Dogru ve yanlis savas orneklerini birlikte toplamak
- Ortak mantik hatalarini bulmak
- Bir duzeltme yapildiginda mevcut dogru savaslari bozup bozmadigini olcmek

## Su ana kadar bilinen durum

Canlidaki mevcut motor:
- `T6 / Gargoyl` davranisi `reactive-only`
- Raund basi random `T6` slow yok
- `T6` debuff sadece `Gargoyle`e dogrudan saldiran dusman gruba uygulanir

Forumdan dogrulanan kurallar:
- Hasar `yukari yuvarlanir`
- Zombie dirilisi `orijinal baslangic sayisi` ile olur
- `T6` debuff stacklenebilir
- `T6` debuff, `T6` grubu yok olsa bile etkisini korur
- Hiz `1` altina, hatta negatife dusebilir

## Arastirilan ana supheler

1. `Revived Zombies` hiz mirasi
- Mevcut kodda dirilen zombiler sabit kendi hizlariyla geri donuyor
- Guclu hipotez: dirilen zombie stacki, oldugu andaki `Zombie` hizini miras almali
- Bu hipotez, `wrong.html` tarafindaki 4 yanlisin 3'unu tek basina acikliyor
- Ve mevcut `approvedStrategies` kayitlarini bozmuyor gorundu

2. Bazi savaslarda rounding farki
- Tekil bir vakada `+1 Gargoyle` farkini acikliyor
- Ama global rounding degisikligi guvenli gorunmedi

3. Bazi dar hedef secimi / tie-break farklari
- Hala tamamen dislanmis degil
- Kalan tekil farklar burada olabilir

## Kullanım

Liste hazir oldugunda bana su tarz bir mesaj yeterli:

`Birkac gun once wrong battle dataset icin bir md dosyasi olusturmustuk. Liste hazir, kontrol et.`

Ben bu dosyayi acip:
- yeni verileri okuyacagim
- ortak desenleri cikaracagim
- aday kurallari test edecegim
- dogru savaslari bozan / bozmayan degisiklikleri ayiracagim

## Kayit kurali

Lutfen hem `dogru` hem `yanlis` savas ekle.

Neden?
- Sadece yanlislar olursa neyin bozuk oldugunu goruruz
- Ama duzeltmenin guvenli olup olmadigini anlayamayiz
- Dogru savaslar, regression kontrolu icin gerekli

Ozellikle su tip savaslar cok degerli:
- `Zombie + T6` etkilesimi olan savaslar
- `1 birim` farkla sapan savaslar
- Kucuk ordulu, deterministik gorunen savaslar
- Birinde dogru, benzerinde yanlis cikan kardes senaryolar
- Mümkünse tam logu olan savaslar

## Kayıt formati

Asagidaki sablonu kopyalayip doldur:

```md
## Kayit 001

- Durum: dogru | yanlis
- Kaynak: simulation | saved | wrong | manuel not
- Tarih:
- Not:

### Dusman
- T1:
- T2:
- T3:
- T4:
- T5:
- T6:
- T7:
- T8:
- T9:
- T10:

### Muttefik
- T1:
- T2:
- T3:
- T4:
- T5:
- T6:
- T7:
- T8:

### Bizde Cikan Sonuc
- Zafer / Maglubiyet:
- Toplam kan kaybi:
- Kayip birlikler:

### Gercek Sonuc
- Zafer / Maglubiyet:
- Toplam kan kaybi:
- Kayip birlikler:

### Tam Log
```text
buraya varsa tam savas gunlugu
```
```

## Hızlı kisa format

Tam sablon fazla uzunsa su kisa formati da kullanabilirsin:

```md
- Durum: yanlis
- Dusman: 5-25-5-0-0-0-0-0-0-0
- Muttefik: 12-0-0-2-0-2-0-0
- Bizde: 0 kayip
- Gercek: 1 Gargoyl kaybi
- Not: zombie dirildi, T6 slow yemisti, sonra 1 ekstra saldiri cikti
```

## Mevcut referans vakalar

Asagidaki vakalar daha once incelendi:

1. `wrong_1777415591614_g7dc64p`
- Bizde: `710`
- Gercek: `785`
- Fark: `+1 Gargoyle`
- Not: Revived zombie hiz mirasi bunu aciklamiyor

2. `wrong_1777417208432_0e4b4j9`
- Bizde: `75`
- Gercek: `0`
- Revived zombie hiz mirasi ile duzeliyor

3. `wrong_1777417584490_jtys0za`
- Bizde: `0`
- Gercek: `75`
- Revived zombie hiz mirasi ile duzeliyor

4. `wrong_1777417728351_4oifh1i`
- Bizde: `0`
- Gercek: `75`
- Revived zombie hiz mirasi ile duzeliyor

## 2026-04-29 dogrulama notu

- `battle-core.js` icinde dirilen zombie stack'ine `unitSpeed[REVIVED_INDEX] = unitSpeed[ZOMBIES_INDEX]` uygulandi
- Sonuc:
  - `wrong_1777417208432_0e4b4j9` duzeldi
  - `wrong_1777417584490_jtys0za` duzeldi
  - `wrong_1777417728351_4oifh1i` duzeldi
  - `wrong_1777415591614_g7dc64p` hala `+1 Gargoyle` farkiyla kaliyor
- `approvedStrategies.firestoredump.json` icindeki kayitlar, kendi sakli `temsilci seed` degerleriyle tekrar kontrol edildiginde bozulma gorulmedi

## 2026-04-29 canli tarama notu

- Canli `wrong.html` taramasinda `17` kayit vardi
- Canli `saved.html` taramasinda `46` kayit vardi
- Guncel motor ile canli `saved` kayitlarinin `46/46`'si uyumlu cikti
- Guncel motor ile canli `wrong` kayitlarinin `14/17`'si gercek sonuc alanina uyumlu cikti
- Kalan `3` vaka:
  - `wrong_1777415591614_g7dc64p` -> bizde `710`, gercek `785`
  - `wrong_1777441496356_6fouf17` -> bizde `65`, gercek `215`
  - `wrong_1777454090042_59ekfny` -> bizde `1010`, gercek `1440`
- Ortak desen:
  - kalan vakalarda motor hala `Gargoyle` kaybini eksik sayiyor
  - son buyuk vakada buna ek olarak `Bat` kaybi da eksik
- Bu nokta deploy / commit oncesi geri donus kaydi olarak korunuyor

## Yeni kayıtlar

Asagidan devam ederek yeni savaslari ekle:
