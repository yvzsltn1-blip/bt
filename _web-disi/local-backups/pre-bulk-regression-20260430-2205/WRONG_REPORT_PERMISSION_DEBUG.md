# Wrong Report Permission Debug Notu

## Ozet

Simulasyon veya optimizer ekraninda `Gercek Sonucu Kaydet` akisi `Missing or insufficient permissions` hatasi veriyordu.

Yapilan inceleme sonunda problem istemci payload'inin genel olarak bozuk olmasi degil, canli Firestore tarafinda `wrongReports` koleksiyonu icin kabul edilen alan setinin beklenenden daha dar olmasi olarak ayristi.

Kisa sonuc:

- Yerel `firestore.rules` dosyasi genis bir `wrongReports` semasi bekliyor gibi gorunuyordu.
- Canli Firestore ise `wrongReports` create isleminde minimum zorunlu alanlar disindaki alanlari reddediyordu.
- Bu nedenle istemcinin gonderdigi ek alanlar `permission-denied` uretiyordu.
- Son cozum olarak istemci `wrongReports` kaydini canli kurallarin fiilen kabul ettigi minimum payload ile gonderecek sekilde daraltildi.

## Ilk Belirti

UI'de gorulen hata:

```text
Yanlis raporu kaydedilemedi: Missing or insufficient permissions.
```

Bu hata hem simulasyon hem optimizer tarafinda goruluyordu.

## Ilk Supheler

Asagidaki ihtimaller tek tek degerlendirildi:

1. `wrongReports` icin Firestore rule ile istemci payload'i uyusmuyor olabilir.
2. String boyutlari Firestore rule limitlerini asiyor olabilir.
3. Uygulama farkli Firestore database veya farkli aktif rule setine yaziyor olabilir.
4. Web Firestore SDK yolu ile REST yolu farkli davranıyor olabilir.

## Yapilan Incelemeler

### 1. Kayit akisinin kodu tarandi

`app.js`, `optimizer.js`, `firebase-client.js`, `firestore.rules` incelendi.

Ilk bulgu:

- UI tarafi `saveWrongReport(report)` cagiriyor.
- `firebase-client.js` icinde `sanitizeWrongReport()` payload olusturuyor.
- `firestore.rules` tarafinda `wrongReports` create kurali var.

### 2. Firestore kurallari guncellendi

Ilk asamada `firestore.rules` tarafinda beklenen ek alanlar eklendi:

- `seed`
- `expectedWinner`
- `expectedLostBlood`
- `expectedUsedCapacity`
- `expectedUsedPoints`
- `expectedAllyLosses`
- `expectedVariantSignature`
- `actualOutcomeLine`
- `actualCapacity`
- `actualLosses`
- `actualWinner`
- `actualLostUnitsTotal`
- `actualLostBlood`
- Ayrica `approvedStrategies` icin `representativeSeed`

Bu degisiklik deploy edildi:

- `firebase deploy --only firestore:rules`

Ancak hata devam etti.

### 3. Ekrana ayrintili hata yazdirildi

Genel `permission-denied` yetersiz oldugu icin UI'ye tanilama kutusu eklendi.

Eklenen bilgiler:

- Firestore hata kodu
- Firestore mesaji
- Belge kimligi
- Gonderilen payload alanlari
- Yerel kural dogrulamasi sonucu

Bu sayede su ayrim netlesti:

- Yerel dogrulama geciyor
- Sunucu yine de `permission-denied` veriyor

### 4. UTF-8 byte boyutu problemi test edildi

Firestone rules `size()` kullandigi icin JS `string.length` ile fark olabilir diye istemci tarafi UTF-8 byte bazli trim ve dogrulama ile guncellendi.

Hata kutusuna byte boyutlari da eklendi:

- `summaryText`
- `logText`
- `actualSummaryText`
- `actualNote`

Ornek gorulen byte boyutlari:

```text
summaryText=406
logText=2450
actualSummaryText=388
actualNote=0
```

Bu degerler limitlerin cok altinda oldugu icin string boyutu sorunu elendi.

### 5. Aktif Firestore database dogrulandi

CLI ile aktif Firestore ortami kontrol edildi.

Bulgu:

- Proje: `bt-analiz`
- Database: `(default)`
- Uygulama da ayni `projectId` ve default Firestore database kullaniyor

Yani problem yanlis projeye veya farkli database'e yazma degildi.

### 6. REST API ile dogrudan create testi yapildi

En kritik ayrim burada yapildi.

#### Test A: Minimum payload ile REST create

Sunucuya dogrudan sadece zorunlu alanlarla POST atildi.

Sonuc:

- Basarili

Bu su anlama geliyor:

- Sunucu tarafinda `wrongReports` create tamamen kapali degil
- Rules veya ortam temel create islemine izin veriyor

#### Test B: Gercek payload'a yakin genis alan seti ile REST create

Ek alanlar da iceren payload REST ile gonderildi.

Sonuc:

- `403 PERMISSION_DENIED`

Bu bulgu kritik:

- Sorun web SDK'ya ozel degil
- Sorun sunucunun ek alanlari kabul etmemesi

### 7. Alanlar tek tek izole edildi

Opsiyonel alanlar tek tek REST ile test edildi.

Test sonucu:

Asagidaki alanlarin her biri tek basina bile eklendiginde create `permission-denied` verdi:

- `seed`
- `usedPoints`
- `lostBlood`
- `expectedWinner`
- `expectedLostBlood`
- `expectedUsedCapacity`
- `expectedUsedPoints`
- `expectedAllyLosses`
- `expectedVariantSignature`
- `actualOutcomeLine`
- `actualCapacity`
- `actualLosses`
- `actualWinner`
- `actualLostUnitsTotal`
- `actualLostBlood`

Ayrica optimizer ile ilgili su alanlar da reddedildi:

- `stage`
- `mode`
- `objective`
- `diversityMode`
- `stoneMode`
- `modeLabel`
- `recommendationCounts`
- `possible`
- `winRate`
- `pointLimit`

Bu testlerden sonra canli Firestore davranisi netlesti:

`wrongReports` create icin fiilen sadece asagidaki minimum alanlar kabul ediliyor:

- `source`
- `sourceLabel`
- `reportedAt`
- `enemyCounts`
- `allyCounts`
- `matchSignature`
- `summaryText`
- `logText`
- `usedCapacity`
- `actualSummaryText`
- `actualNote`

## Son Tespit

Canli Firestore tarafinda `wrongReports` create kurali, yereldeki bekledigimiz genis semadan daha dar calisiyor.

Pratikte bu durum su anlama geliyor:

- Kod daha fazla alan gonderirse write reddediliyor.
- Minimum alanlara inerse write kabul ediliyor.

Yerel `firestore.rules` dosyasi ile canli davranis arasinda fark var gibi gorunuyor.

Muhtemel sebepler:

1. Canli rules release bekledigimiz dosya ile birebir ayni degil.
2. `wrongReports` icin daha eski veya daha dar bir rule aktif.
3. Rule deploy edilmis olsa da gercekte degerlendirilen kural seti farkli olabilir.

## Yapilan Son Kod Degisikligi

Kalici is akisini bozmadan su cozum uygulandi:

### `firebase-client.js`

`sanitizeWrongReport()` su anda `wrongReports` kaydini sadece sunucunun fiilen kabul ettigi minimum alanlarla uretir:

- `source`
- `sourceLabel`
- `reportedAt`
- `enemyCounts`
- `allyCounts`
- `matchSignature`
- `summaryText`
- `logText`
- `usedCapacity`
- `actualSummaryText`
- `actualNote`

Boylece ek alanlardan kaynakli `permission-denied` engellenmis oldu.

### `optimizer.js`

Optimizer ekraninda kayitli yanlis raporu bulma mantigi `stage` zorunluluguna bagli kalmasin diye `matchSignature` odakli hale getirildi.

Neden gerekliydi:

- Yeni minimal `wrongReports` payload'inda `stage` artik saklanmiyor.
- Eslestirme yine de dogru calissin diye `matchSignature` temel alindi.

## Deploy Gecmisi

Asagidaki deploy'lar yapildi:

1. Firestore rules deploy
   - `firebase deploy --only firestore:rules`
2. Ayrintili hata kutusu icin hosting deploy
   - `firebase deploy --only hosting`
3. UTF-8 byte bazli trim/diagnostic icin hosting deploy
   - `firebase deploy --only hosting`
4. REST fallback denemesi icin hosting deploy
   - `firebase deploy --only hosting`
5. Minimum payload fix'i icin hosting deploy
   - `firebase deploy --only hosting`

## Ozetle Ne Denendi

- Koddaki kayit akisinin taranmasi
- Firestore rules genisletilmesi
- Rules deploy
- UI'de ayrintili hata gostergesi
- UTF-8 byte bazli trim ve dogrulama
- Aktif Firestore database dogrulamasi
- REST ile minimum payload testi
- REST ile genis payload testi
- Alan bazli tek tek izolasyon testi
- `wrongReports` payload'ini minimum semaya dusurme
- Optimizer eslestirmesini `matchSignature` odakli yapma

## Su Anki Beklenti

Son koddan sonra `Gercek Sonucu Kaydet` akisinin, `wrongReports` dokumanini minimum payload ile basariyla yazmasi bekleniyor.

Eger hala hata olursa bir sonraki bakilacak yer:

- Canli Firestore rules release'inin birebir dump edilip `wrongReports` create kuralinin dogrudan dogrulanmasi

