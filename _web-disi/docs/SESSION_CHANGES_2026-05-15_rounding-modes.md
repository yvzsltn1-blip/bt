# Oturum Degisiklikleri

Tarih: `2026-05-15`

Bu dosya, `2026-05-15` tarihli bu Codex oturumunda yapilan degisikliklerin ozetidir.

## Oturumun Ana Hedefi

Bu oturumda ana hedef, savas motorundaki hasar yuvarlama davranisini kullanici ihtiyacina gore daha kontrollu hale getirmek, bunu UI tarafinda secilebilir 3 moda donusturmek, yanlis sonuc duzeltme ekranini hizlandirmak ve tum degisiklikleri canliya almak oldu.

## 1. Ilk Hata Tespiti: 89.25 Hasar / 90 Can Senaryosu

- Kullanici, ilk turda `Yarasa Surusu (T1)` hasarinin raporda `90` olarak yazildigini ama kalem kagit hesabinda bunun `89.25` oldugunu belirtti.
- Bu nedenle savasin mevcut simulatorde gerektiginden daha iyimser gorunebildigi tespit edildi.
- Elle tekrar degerlendirme yapildi:
  - `89.25` hasar `89` kabul edilince savas sonucu tersine donuyor.
  - Yani bu hassas esikte ilk yuvarlama farki sonucu degistirebiliyor.

Bu adim, sonraki yuvarlama politika degisikliginin gerekcesini olusturdu.

## 2. Guvenli Yuvarlama Politikasinin Eklenmesi

Kullanici talebine gore yeni guvenli politika tanimlandi:

- muttefik hasari her zaman asagi yuvarlansin
- dusman hasari her zaman yukari yuvarlansin

Ornek:

- `89.9` muttefik hasari -> `89`
- `89.1` dusman hasari -> `90`

Yapilan degisiklikler:

- `battle-core.js`
- `tests/test-battle-rounding-policy.js`

Uygulanan kapsam:

- ana normal vurus hasari
- witch splash hasari
- lich splash hasari
- corpse revenge hasari

Bu asama, "gercek motora birebir benzemek" yerine "iyimser yanlis pozitifleri azaltmak" icin korumaci bir mod ekledi.

## 3. 3 AyrI Hesap Modunun Tasarlanmasi

Kullanici talebi uzerine ikili davranis yerine 3 modlu bir sistem kuruldu:

- `Degismemis`
  - eski davranis
- `Guvenli`
  - muttefik hasari asagi, dusman hasari yukari yuvarlanir
- `Gercek`
  - ondalikli hasar ve can korunur

Bu degisiklikle artik kullanici tek bir yuvarlama politikasina kilitli degil.

Degisen dosyalar:

- `battle-core.js`
- `app.js`
- `optimizer.js`
- `index.html`
- `optimizer.html`
- `optimizer-minimum.html`
- `styles.css`
- `reliability.js`
- `saved.js`
- `fav.js`
- `wrong.js`
- `tests/test-battle-rounding-policy.js`

Yapilan isler:

- savas motoruna 3 modlu rounding akisi eklendi
- simulasyon ekranina mod secici eklendi
- optimizer ekranlarindaki 3'lu secim yeni mod mantigina baglandi
- reliability, saved, fav ve wrong ekranlarina secili mod bilgisi tasinabilir hale getirildi
- kayit/favori/yanlis rapor akislarina `roundingMode` bilgisi dahil edildi

## 4. Optimizer Hedef Secimi ve UI Yeniden Duzeni

Kullanici istegiyle optimizer ustundeki eski 3'lu buton mantigi yeniden duzenlendi:

- eski hedef butonlari kaldirilmadi ama gizli/ikincil hale getirildi
- `Hedef` secimi dropdown uzerine tasindi
- yuvarlama secimi ayrica ayri bir 3'lu buton grubu olarak sunuldu

Bu degisiklik optimizer ekraninda iki ayri kavrami netlestirdi:

- hedef: en az kayip / en az ordu / daha guvenli kazan
- hesap modu: degismemis / guvenli / gercek

## 5. Yanlis Sonuc Duzenle Ekraninin Hizlandirilmasi

Kullanici, yanlis sonuc ekraninda maglubiyet durumunda tum ordu kaybini tek tek elle girmek istemedigini belirtti.

Bunun uzerine `Yanlis Sonucu Duzenle` modali degistirildi:

- `Zafer / Maglubiyet` ikili secimi eklendi
- `Maglubiyet` secilince:
  - sonuc satiri otomatik maglubiyet oluyor
  - tum birlik kayiplari otomatik eldeki ordunun tamami olarak dolduruluyor
- `Zafer` secilince:
  - mevcut manuel kayip girme akisi korunuyor
- `Maglubiyet -> Zafer` gecisinde onceki manuel zafer degerleri geri yukleniyor

Degisen dosyalar:

- `index.html`
- `optimizer.html`
- `optimizer-minimum.html`
- `app.js`
- `optimizer.js`
- `styles.css`

## 6. Canliya Alinan Deploylar

Bu oturum icinde birden fazla kez Firebase Hosting deploy yapildi.

Canli adres:

- `https://bt-analiz.web.app`

Deploy edilen ana paketler:

- 3 modlu rounding sistemi
- optimizer UI mod secimi
- yanlis sonuc modalindeki `Zafer / Maglubiyet` akisi
- optimizer `roundingMode` hata duzeltmeleri
- script cache-busting surum guncellemeleri

## 7. Optimizer `roundingMode is not defined` Hatasinin Takibi

Canli ortamda hem `optimizer.html` hem `optimizer-minimum.html` icin su hata alindi:

- `roundingMode is not defined`

Yapilan incelemeler:

- `optimizer.js` icinde `roundingMode` gecen butun akislari tarandi
- `renderOptimizerResult`, `createComparisonKey`, `createWrongReportEntry`, `createOpenSimulationButton`, `openSimulationForCounts` ve ilgili `meta` gecisleri kontrol edildi
- bir eksik `meta.roundingMode` gecisi daha once duzeltildi
- tarayici cache ihtimali icin HTML script surumleri bump edildi
- canli dosyalarda yeni `optimizer.js` ve `battle-core.js` surumlerinin servis edildigi ayrica dogrulandi

Son korumali patch:

- `optimizer.js` icinde `optimizerRoundingMode` ile senkron giden bir `roundingMode` fallback binding eklendi
- mod butonuna basildiginda bu binding de guncelleniyor
- kayit/geri yukleme akislari icinde de ayni senkron korunuyor

Bu adimlar, canli hata kaynaginin optimizer tarafindaki olasi serbest `roundingMode` erisimlerini kirilmadan tolere etmek icin eklendi.

Bu son hata takibi kapsaminda degisen dosyalar:

- `optimizer.js`
- `optimizer.html`
- `optimizer-minimum.html`
- `index.html`
- `reliability.html`
- `saved.html`
- `wrong.html`
- `fav.html`
- `regression-report.html`

## 8. Cache-Busting ve Script Surum Guncellemeleri

Tarayici cache kaynakli eski bundle kullanimi riskine karsi script surumleri guncellendi.

Guncellenen referanslar:

- `battle-core.js?v=20260515-03`
- `optimizer.js?v=20260515-04`
- `app.js?v=20260515-03`
- `reliability.js?v=20260515-03`
- `saved.js?v=20260515-03`
- `wrong.js?v=20260515-03`
- `fav.js?v=20260515-03`

Bu degisiklik, canli kullanicinin eski cache ile calisan dosyalara takilmasini azaltmak icin yapildi.

## 9. Test ve Dogrulama Notlari

Bu oturumda tekrar tekrar kullanilan temel dogrulamalar:

- `node --check battle-core.js`
- `node --check app.js`
- `node --check optimizer.js`
- `node --check reliability.js`
- `node --check saved.js`
- `node --check wrong.js`
- `node --check fav.js`
- `node tests/test-battle-rounding-policy.js`
- `node tests/test-battle-log-unit-summary.js`
- `firebase.cmd deploy --only hosting`

Ek olarak:

- canli `optimizer.html` icerigi alinarak yeni script surumlerinin gercekten servis edildigi kontrol edildi
- canli `optimizer.js` icerigi okunarak yeni kodun yayinda oldugu dogrulandi

## 10. Bu Oturumda Degisen Dosyalarin Toplu Listesi

- `battle-core.js`
- `app.js`
- `optimizer.js`
- `index.html`
- `optimizer.html`
- `optimizer-minimum.html`
- `styles.css`
- `reliability.js`
- `saved.js`
- `fav.js`
- `wrong.js`
- `fav.html`
- `saved.html`
- `wrong.html`
- `reliability.html`
- `regression-report.html`
- `tests/test-battle-rounding-policy.js`

## Son Durum

- 3 modlu rounding sistemi kodlandi
- simulasyon ve optimizer tarafina tasindi
- yanlis sonuc duzeltme akisi hizlandirildi
- degisiklikler birden fazla kez canliya deploy edildi
- optimizer tarafindaki `roundingMode` hatasi icin ek koruma patch'i de canliya verildi
