# Wraith Targeting Note

Bu not, `Hayaletler (T6)` hedefleme farkini arastirirken yapilan kontrolleri ve su anki deneysel degisikligi ozetler.

## Problem Ozeti

Bazi gercek savas sonuclari ile sistemin verdigi sonuc birbirini tutmuyordu.

Ozellikle su vaka ayristirildi:

- Rakip: `24-27-22-12-9-13-6`
- Biz: `24-34-48-12-1`

Gercek sonuc:

- `Yarasa 9`
- `Gulyabani 25`
- `Bansi 12`
- `Nekromant 1`

Mevcut sistemin sonucu:

- `Yarasa 9`
- `Gulyabani 34`
- `Bansi 0`
- `Nekromant 1`

Bu farkin ana kaynagi, `Raund 2 / Hamle 3` civarinda `Hayaletler`in `Gulyabani` yerine `Bansi` vurmasi gerekip gerekmedigi sorusuydu.

## Kontrol Edilen Hipotezler

Asagidaki mekanikler tek tek izole edilerek test edildi:

1. Tur sirasi / hiz onceligi
2. `Bansi` `%25` hasar azaltmanin ayni raund icindeki uygulama zamani
3. Olum sonrasi efektlerin sirasi
   - `Zombi` dirilisi
   - `Sismis Ceset` intikam hasari
   - `Nekromant` buff sirasi
4. `Hayalet` hedef secme mantigi

## Elenen Hipotezler

Su denemeler ya bu savasi aciklamadi ya da sistemi fazla bozdu:

- `enemy first` hiz onceligi:
  - Sorunlu savasi degistirse bile genel sistemi cok sert bozdu.
- `front / rear` agirlikli siralama degisiklikleri:
  - Bu vakayi aciklamadi.
- `Bansi` debuff zamanlamasi:
  - Bu vakada sonucu degistirmedi.
- `Sismis Ceset` intikam hasari ile `Nekromant` buff sirasini degistirmek:
  - Bu vakada sonucu degistirmedi.
- `Hayalet round 2'den sonra her durumda rear-target olsun`:
  - Tek vakayi duzeltti ama diger savaslari gereksiz yere bozdu.

## Su Anki Deneysel Degisiklik

Su an kodda daha dar bir deneysel kural var:

`Hayaletler (T6)`, sadece su kosullar ayni anda saglandiginda arka safa doner:

1. `roundCount >= 2`
2. `Gulyabani sayisi > 0`
3. `Gulyabani sayisi < Hayalet sayisi`
4. `Bansi sayisi > 0`
5. `Hayalet`in ham hasari, mevcut `Bansi` toplam canini tek vurusla silebilecek kadar yuksek

Kod etkisi:

- Normalde `Hayalet` front-first hedefler.
- Yukaridaki durum olusursa, `Bansi` once hedeflenir.

## Neden Bu Degisiklik Yapildi

Bu kural, iki farkli gercek savasi ayni anda ayirabildi:

### Vaka 1

- Rakip: `24-27-22-12-9-13-6`
- Biz: `24-34-48-12-1`

Bu savasta:

- Raund 2 basinda `Gulyabani = 9`
- `Hayalet = 13`
- `Bansi = 12`
- `Hayalet` ham hasari `91`
- `Bansi` toplam cani `48`

Yani `Hayalet`, `Bansi` stackini tek vurusla silebiliyor.
Bu durumda rear-target yapmak gercek sonuca uyuyor.

### Vaka 2

- Rakip: `28-13-15-19-16-10-5`
- Biz: `38-28-23-19-1`

Bu savasta:

- Raund 2 basinda `Gulyabani = 5`
- `Hayalet = 10`
- `Bansi = 19`
- `Hayalet` ham hasari `70`
- `Bansi` toplam cani `76`

Yani `Hayalet`, `Bansi` stackini tek vurusla silemiyor.
Bu durumda front-first kalmak gercek sonuca uyuyor.

## Kontrol Ettigimiz Ornekler

Deneysel kural su orneklerde kontrol edildi:

1. `24-27-22-12-9-13-6` vs `24-34-48-12-1`
   - Beklenen gercek sonuca uydu
2. `28-13-15-19-16-10-5` vs `38-28-23-19-1`
   - Mevcut dogru sonucu bozmadI
3. `22-12-27-21-16-10-1` vs `38-18-21-22-1`
   - Mevcut dogru sonucu bozmadI
4. `19-9-13-22-11-11-9` vs `9-48-6-23-1`
   - Mevcut dogru sonucu bozmadI

## Risk Notu

Bu degisiklik halen `experiment` seviyesindedir.

Nedeni:

- Kural, gercek oyunun resmi tanimi uzerinden degil,
- elimizdeki gercek savas sonuclarini ayiran en dar davranis olarak bulundu.

Bu yuzden yeni gercek savas ornekleri geldikce tekrar dogrulanmasi gerekir.

## Geri Donus Noktalari

Asagidaki rollback etiketleri mevcut:

- `before-wraith-target-fix`
- `before-wraith-threshold-fix`

Su anki deneysel commit:

- `f2966fd` - `experiment: narrow wraith rear-target rule`

## Ozet

Bu degisiklik:

- onceki genis `Hayalet rear-target` fix'inden daha dar,
- belirli bir esik durumunda devreye giriyor,
- test edilen son ek orneklerde mevcut dogru sonuclari bozmadan,
- ilk problemli gercek savasi duzeltiyor.
