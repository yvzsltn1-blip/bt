# 2026-05-01 Buyuk Sapma Notu

Bu not, 1 Mayis 2026 tarihinde kullanicidan gelen yeni gercek savas sonucu uzerinden yapilan arastirmayi ozetler.

## Vaka

Battle:

- Dusman:
  - `24 skeletons`
  - `11 zombies`
  - `17 cultists`
  - `7 bonewings`
  - `15 corpses`
  - `9 wraiths`
  - `9 revenants`
  - `7 giants`
  - `4 broodmothers`
  - `4 liches`
- Muttefik:
  - `36 bats`
  - `69 ghouls`
  - `36 thralls`
  - `4 banshees`
  - `9 necromancers`
  - `4 gargoyles`
  - `1 witch`
- Seed: `61372819`

## Baslangic Durumu

Mevcut motorun verdigi sonuc:

- `15 bats`
- `69 ghouls`
- `4 banshees`
- `9 necromancers`
- `1 witch`
- toplam `1865 blood`

Kullanicidan gelen gercek sonuc:

- `24 bats`
- `69 ghouls`
- `22 thralls`
- `4 banshees`
- `9 necromancers`
- `4 gargoyles`
- `1 witch`
- toplam `2695 blood`

Sapma:

- motor: `1865`
- gercek: `2695`
- fark: `830 blood`

## Ne Denendi

Bu savas icin `investigate-vs-hypotheses.js` olusturuldu.

Amaci:

- `battle-core.js` uzerine in-memory patch uygulamak
- ayni seed ile farkli mekanik hipotezlerini denemek
- mevcut `approved` ve `wrong` veri setlerinde regresyon var mi kontrol etmek

Ana hipotezler:

1. `speed tie` sirasini degistirmek
2. `witch splash` sadece ana hedef olduyse tetiklensin
3. `broodmother` sadece tur sonunda hala hayattaysa spawn etsin
4. yukaridaki varyantlarin kombinasyonlari

## Ana Bulgular

### 1. Speed tie hipotezi uygun degil

`speed tie` sirasini degistirmek bu vakayi iyilestirmedi; tersine sonucu daha da bozdu.

Bu nedenle koda alinmadi.

### 2. Witch splash fazla agresifti

Mevcut kodda `witch` cift turlarda vurdugunda splash etkisi hedef olmeden de aciliyordu.

Bu, ilgili savasta dusmani fazla erken temizleyip kaybi yapay olarak dusuruyordu.

Uygulanan duzeltme:

- `witch splash` sadece `defender` o hamlede tamamen yok edilirse calisacak

### 3. Broodmother spawn zamani fazla genisti

Bir onceki davranista raund basinda yeterli sayida `broodmother` varsa, tur sonunda olmus olsalar bile ek `spiderlings` dogabiliyordu.

Uygulanan duzeltme:

- `broodmother` sadece tur sonunda hala hayattaysa spawn uretecek

## Koda Islenen Patch

`battle-core.js` icine su iki degisiklik islendi:

1. `witch splash only on kill`
2. `broodmother spawn only if alive`

## Patch Sonrasi Sonuc

Ayni savasta yeni motor sonucu:

- `25 bats`
- `69 ghouls`
- `21 thralls`
- `4 banshees`
- `9 necromancers`
- `4 gargoyles`
- `1 witch`
- toplam `2685 blood`

Yani buyuk sapma su seviyeye indi:

- eski motor: `1865`
- patch sonrasi: `2685`
- gercek: `2695`

Kalan fark:

- `1 bat`
- `1 thrall`
- `10 blood`

Pratikte bu vaka icin sonuc "yeterince yakin" seviyesine gelmis oldu.

## Son Mikro-Fark Icin Denenenler

Asagidaki ek mikro hipotezler de tarandi:

- `corpses revenge damage` katsayisini dar aralikta degistirmek
- `banshee` hasar azaltimini dar aralikta degistirmek
- bu iki sabiti birlikte taramak

Bu taramada bu tek savas icin tam `2695` sonuc bulunabildi.

Ornek dar kombinasyon:

- `corpses revenge` yaklasik `%18`
- `banshee reduce` yaklasik `%21-%24`

Ama bu mikro ayarlar genele uygulandiginda eski dogru veri setini bozdu:

- `approved` tarafi `46/46` yerine sert dustu

Bu nedenle bu sabitler koda alinmadi.

## Teknik Karar

Bu oturum sonunda kabul edilen sonuc:

- buyuk sapmayi aciklayan ve guvenli gorunen iki patch koda alindi
- son `10 blood` farki icin global sabitlerle oynamak su an guvenli degil
- mevcut kod bu vaka icin `1865 -> 2685` seviyesine getirildi

## Sonraki Arastirma Alani

Kalan `1 bat / 1 thrall` farki buyuk ihtimalle su alanlardan birine bagli:

- `corpses revenge damage`
- `banshee -> lich` azaltim etkilesimi
- son turlardaki hedef secimi / speed kirilimi

Ama bunlari genele uygulamadan once daha fazla gercek savas ornegi toplamak gerekir.
