# Gargoyle Version Difference Note

Bu not, `C:\Users\YAVUZ\Downloads\BT-Analyss - v2` ile mevcut proje arasindaki ilgili savas motoru farkini ve neden geri donus yaptigimizi ozetler.

## Problem Ozeti

Arastirilan vaka suydu:

- `v2` ayni savasi tekrar tekrar calistirinca farkli sonuclar uretiyordu.
- Bu farkli sonuclarin bazilari gercek savas sonucuyla uyusuyordu.
- Mevcut surum ise ayni savasta tek bir sonuca kilitleniyordu.
- Bu sabit sonuc gercek sonucla uyusmuyordu.

Ozellikle su davranis dikkat cekti:

- `v2`: varyans var
- mevcut surum: deterministik ama hatali

## Arastirma Amaci

Hedef, su soruya cevap vermekti:

`v2` ile mevcut surum arasinda hangi mekanik degisti ve bu degisiklik neden savas sonucunu sabit ama yanlis hale getirdi?

## Kontrol Edilen Olasiliklar

Asagidaki farklar kontrol edildi:

1. Rastgelelik kaynagi
2. `Hayalet (T6)` hedefleme davranisi
3. `Gargoyl (T6)` yetenegi
4. Raund ici saldiri sirasi degisimleri

## Elenen Neden

`Hayalet` icin sonradan eklenmis ozel hedefleme kurali ilk supheli adaylardan biriydi. Ancak bu savasta kapatildiginda sonuc degismedi.

Sonuc:

- sorun `Hayalet` duzeltmesinden kaynaklanmiyordu

## Gercek Kök Neden

Asil fark `Gargoyl` mekanigindeydi.

### `v2` Davranisi

`v2` surumunde:

- eger `Gargoyl` hayattaysa, raund basinda rastgele bir dusman biriminin hizi `-2` dusuruluyor
- ardindan saldiri sirasi yeni hizlara gore yeniden kuruluyor

Bu mekanik iki seyi ayni anda yapiyordu:

1. savasa rastgelelik katiyordu
2. saldiri sirasi degistigi icin tum sonraki hamleleri zincirleme etkiliyordu

Bu nedenle `v2` ayni girdide farkli sonuclar uretebiliyordu.

### Mevcut Surumdeki Davranis

Mevcut surumde bu davranis kaldirilmisti. Yerine su mantik gelmisti:

- dusman `Gargoyl`e vurursa, vuran birimin hizi `-2` dusuyor

Bu yeni davranis:

- raund basi rastgele hiz dusurmesini ortadan kaldirdi
- savasi daha deterministik hale getirdi
- ama bu spesifik vakada gercek savas akisindan uzaklasti

Sonuc olarak sistem tek bir sonuca sabitlendi:

- sabit
- tekrarlanabilir
- ama yanlis

## Neden Sonucu Bozdu

Bu savasta `Gargoyl` kaynakli hiz degisimi kritik.

`v2` mantiginda hangi dusman biriminin yavaslatildigi degistigi icin:

- raund ici saldiri sirasi degisiyor
- bazi birimler once veya sonra vuruyor
- bazi stackler hayatta kaliyor ya da daha erken dusuyor
- `Bansi`, `Hayalet`, `Kemik Kanat`, `Nekromant` gibi etkiler farkli sirayla devreye giriyor

Bu da ayni savasi farkli kayip profillerine goturuyor.

Gercek savas sonucuyla uyusan `1245 kan` sonucu da bu eski akista yeniden uretilabildi.

## Yapilan Degisiklik

Mevcut surume `v2` tarzindaki `Gargoyl` davranisi geri alindi.

Yapilanlar:

1. raund basi rastgele dusman hiz dusurme mantigi geri getirildi
2. hiz dusuruldukten sonra saldiri sirasini yeniden kuran akis geri getirildi
3. mevcut surumdeki reaktif `Gargoyl` hiz dusurme davranisi kaldirildi
4. `battle-core.js` script versiyon etiketi guncellendi
5. hosting deploy yapildi

## Net Davranis Degisikligi

Geri donus sonrasi:

- simülasyon tekrar varyansli hale geldi
- ayni savas her calistirmada farkli sonuc verebilir
- `1245 kan` sonucu tekrar uretiliyor
- `900 kan` sonucu artik tek zorunlu sonuc degil

Bu degisiklik bilincli olarak yapildi, cunku hedef:

- "her zaman ayni sonucu vermek" degil
- "gercek oyundaki davranisa daha yakin sonucu tekrar uretebilmek" idi

## Tradeoff

Bu geri donusun artisi:

- `v2` ile uyumlu savas akisi geri geldi
- gercek sonuca uyan varyantlar yeniden uretiliyor

Bu geri donusun eksisi:

- sonuc tekrar deterministik degil
- ayni savas her calistirmada farkli kayiplar verebilir

Bu tradeoff kabul edildi, cunku mevcut deterministik davranis dogru sonucu sistematik olarak kaciriyordu.

## Degisen Dosyalar

- `battle-core.js`
- `index.html`
- `optimizer.html`
- `saved.html`
- `wrong.html`

## Sonuc

Bu fark bir "rastgelelik bugi" degil, iki farkli tasarim secenegi arasindaki davranis farkiydi.

- `v2` daha oynak ama bu vaka icin daha gercekciydi
- mevcut onceki surum daha stabil ama bu vaka icin yanlisti

Bu nedenle `Gargoyl` mekanigi `v2` davranisina geri alindi.
