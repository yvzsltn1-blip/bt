# TekilMod Uygulama Notlari

## Ozet

Bu dokuman, optimizer'a eklenen `TekilMod` davranisinin ne yaptigini, hangi dosyalarda nasil uygulandigini ve neden bu yaklasimin secildigini aciklar.

Kisa ozet:

- UI'ya yeni bir `TekilMod` toggle butonu eklendi.
- Bu mod, standart ve cesitlilik aramasindan farkli olarak "tekil kayip onceligi" ile sonuc secmeye baslar.
- Arama sadece skor sirasini degistirmiyor; farkli bolgeleri tarayacak sekilde yeni adaylar da uretiyor.
- Mobil duzende `Cesitlilik Modu` ve `TekilMod` ayni satirda yan yana gosterilecek sekilde duzenleme yapildi.
- Hosting deploy tamamlandi.

## Kullanici Ihtiyaci

Istek su mantiga dayaniyordu:

1. Once kayipsiz kazanan dizilim varsa onu bul.
2. Kayıpsiz yoksa `1xT1`, sonra `1xT2`, sonra `1xT3` ... `1xT8` kayipli kazananlari ara.
3. Tekil kayipla kazanamiyorsa bu kez ikili kombinasyonlara gec:
   `1xT1 + 1xT2`, `1xT1 + 1xT3` ... gibi.
4. Son seviyede `T1 + T2 + ... + T8` gibi daha genis kombinasyonlara kadar gidebilsin.
5. Bunu yaparken mevcut arama mantiginin sadece bir varyanti olmasin; farkli yerleri de tarasin.

Buradaki temel beklenti, optimizer'in "ortalama kaybi biraz daha dusuk olan" dizilim yerine, kullanici icin daha anlamli olan "hangi tier'den kac adet kayip veriliyor" yapisina oncelik vermesiydi.

## Temel Tasarim Karari

TekilMod'u yeni bir "objective" olarak degil, mevcut optimizer'in uzerine binen yeni bir "search flavor" olarak ele aldim.

Bunun nedeni:

- `objective` sistemi zaten `min_loss`, `min_army`, `safe_win` gibi genel karar mantiklarini tasiyor.
- TekilMod ise bunlardan farkli olarak hem:
  - aday tarama uzayini degistiriyor
  - hem de feasible adaylar arasindaki oncelik sirasini degistiriyor
- Bu nedenle `diversityMode` gibi ayri bir mod bayragi olarak eklemek, mevcut kod yapisina daha temiz oturdu.

Sonuc olarak sistemde artik su mod flavor'lari var:

- Standart
- Cesitlilik
- TekilMod
- Cesitlilik + Tekil

## Degisen Dosyalar

### `optimizer.html`

- `TekilMod` butonu eklendi.
- `Cesitlilik Modu` ve `TekilMod` ayni kapsayici icine alindi.

### `optimizer-minimum.html`

- Standart optimizer ile ayni sekilde `TekilMod` butonu eklendi.

### `styles.css`

- Yeni `.optimizer-mode-toggle-row` eklendi.
- Mobilde iki mod butonunun tek satirda kalmasi saglandi.

### `optimizer.js`

- UI state ve event baglantilari eklendi.
- `optimizerTekilMode` state'i eklendi.
- Arama anahtari, karsilastirma anahtari ve tum metadata zincirine `tekilMode` dahil edildi.
- Batch run sonuclarinda "daha iyi aday" secimi TekilMod onceligine gore guncellendi.
- Favori, onayli kayit, wrong report ve comparison cache akislarina TekilMod bilgisi eklendi.

### `battle-core.js`

- Tekil kayip onceligi hesaplayicisi eklendi.
- TekilMod icin ayri aday uretim mantigi eklendi.
- `compareEvaluations` TekilMod aktifken yeni oncelik kuraliyla calisacak sekilde guncellendi.
- Ana optimizer akisina `tekilMode` ve `tekilCandidateCount` eklendi.

## UI Yaklasimi

UI tarafinda amac yeni bir ozelligi ekleyip ekran kalabaligi yaratmamakti.

Bu yuzden:

- `Simule Et` butonunun yanina yeni tek bir toggle eklendi.
- `Cesitlilik Modu` ile beraber ayni satirdaki mod secim ailesinin parcasi gibi davrandi.
- Ayrica mobilde bu iki toggle'in alt alta dusmesi yerine ayni satirda durmasi istendi; bu istek `styles.css` tarafinda grid tabanli bir sarmalayici ile cozuldu.

Secilen cozum:

- Masaustunde normal akisa uyumlu
- Mobilde tek satirli
- Mevcut `button-secondary` / `is-active` desenine uyumlu

## State ve Metadata Yaklasimi

TekilMod sadece bir buton goruntusu degil; optimizer tarafinda scenario kimliginin parcasi olmaliydi.

Bu nedenle `optimizer.js` icinde asagidaki akislara `tekilMode` eklendi:

- `optimizerSearchSession`
- `optimizerIncumbentContext`
- `currentApprovedCandidate`
- `currentTopResultsContext`
- `createSearchKey(...)`
- `createComparisonKey(...)`
- favori kayitlari
- onayli optimizer kayitlari
- wrong report verisi
- reliability sayfasina giden sessionStorage verisi

Bu secimin nedeni:

- TekilMod acikken bulunan sonuclar, standart modun devam oturumu sayilmamali
- Ayni rakip icin comparison cache dogru flavor ile calismali
- Bir sonucu kaydettigimizde sonradan "hangi modla bulunmustu" bilgisi korunmali

## Tekil Kayıp Onceligi Nasil Modellenildi

TekilMod'un cekirdegi, bir adayin kayip profilini "kan kaybi" gibi tek sayiya indirgememek.

Bunun icin her aday icin bir `tekil priority` ozeti uretildi:

- `mask`
- `totalLoss`
- `overflow`
- `maxLoss`
- `activeCount`
- `isBinary`

### `mask`

Her tier icin yuvarlanmis ortalama kayip 0'dan buyukse ilgili bit aciliyor.

Ornek:

- sadece `T1` kaybi varsa tek bir bit
- `T1 + T3` kaybi varsa iki bit
- `T1 + T2 + T3 + ... + T8` kaybi varsa butun bitler acik

Bu sayede kullanicinin tarif ettigi kombinasyon sirasini deterministik bicimde temsil etmek mumkun oldu.

### `isBinary`

Bir tier icin yuvarlanmis kayip `1`'i gecmiyorsa binary sayildi.

Bu su anlama geliyor:

- `0` veya `1` kayipli tier'ler "tekil" grubuna dahil
- `2+` kayip varsa artik saf tekil siniftan cikiyor

Bu secim, kullanicinin "1 t1, 1 t2..." onceligine uyuyor.

### `overflow`

Tier bazinda `1`'in ustune tasan kayiplari topluyor.

Boylece:

- `1xT1 + 1xT2` gibi saf tekil bir sonuc
- `2xT1` gibi tek tier'de yigilmis bir sonuc

ayri siniflarda degerlendirilebiliyor.

### `activeCount`

Kac farkli tier'de kayip oldugunu tutuyor.

Bu sayede siralama su mantikla calisiyor:

1. once saf tekil sonuclar
2. sonra daha az tier'e yayilanlar
3. sonra bit mask sirasina gore erken tier kombinasyonlari
4. sonra overflow'u dusuk olanlar
5. sonra toplam kaybi dusuk olanlar

## Tekil Karsilastirma Kurali

`battle-core.js` icinde `compareEvaluations(...)` TekilMod aktifse once yeni Tekil oncelik karsilastirmasini kullaniyor.

Siralama mantigi ozetle su:

1. feasible olan her zaman feasible olmayandan onde
2. TekilMod aciksa:
   - saf tekil profil, saf olmayan profilden onde
   - daha az aktif tier onde
   - daha erken bit mask onde
   - daha az overflow onde
   - daha dusuk toplam kayip onde
   - daha dusuk max tier kaybi onde
3. Tekil oncelikte esitlik varsa mevcut objective mantigina donuluyor
   - win rate
   - expected loss
   - used points
   - capacity
   - vb.

Bu bilincli bir karar:

- TekilMod tum sistemi atip yerine baska optimizer yazmiyor
- sadece kullanici icin daha anlamli bir oncelik katmani ekliyor

## Neden Sadece Siralama Yetmedi

Eger sadece `compareEvaluations(...)` degistirilseydi, TekilMod "var olan adaylar arasindan" daha tekil gorunenleri secerdi.

Ama kullanici ozellikle:

- farkli yerleri tarasin
- ayri bir sekilde arasin

dedi.

Bu nedenle TekilMod icin ayri aday uretimi de eklendi.

## Tekil Aday Uretimi Yaklasimi

`buildTekilCandidates(...)` yeni fonksiyonu eklendi.

Bu fonksiyonun amaci:

- sadece iyi gorunen meta dizilimleri degil
- farkli tier alt-kumeleri etrafinda sekillenen dizilimleri de denemek

Uretim mantigi 3 ana eksende kuruldu:

### 1. Alt-kume tabanli odak arama

Tier kombinasyonlari mask olarak geziliyor.

Ornek:

- sadece `T1`
- sadece `T2`
- `T1 + T2`
- `T1 + T3`
- ...

Her kombinasyon icin:

- odakli bir aday
- ters doldurma oncelikli bir aday
- sparse bir aday
- daha hibrit bir aday

uretiliyor.

Bu, TekilMod'un sadece stratejik en guclu birliklere degil, kayip profili olusturabilecek farkli tier kombinasyonlarina bakmasini sagliyor.

### 2. Farkli doldurma yonleri

Ayni focus set icin farkli doldurma oncelikleri denendi:

- strategic order
- reverse order
- sparse dagilim
- randomize hybrid dagilim

Bu secim, ayni tier kombinasyonunda bile cok farkli kompozisyonlar uretilmesine yardimci oluyor.

### 3. Sonradan ek rastgele alt-kume taramasi

Deterministik kombinasyonlara ek olarak, yeterli cesit cikmazsa rastgele alt-kumeler de deneniyor.

Bu sayede:

- erken tier kombinasyonlari yakalanir
- ama arama tek tip hale de gelmez

## Ana Optimizer Akisina Entegrasyon

`optimizeArmyUsage(...)` icinde TekilMod icin su genisletmeler yapildi:

- `tekilMode` option olarak eklendi
- `tekilCandidateCount` hesaplandi
- `compareEntries` artik TekilMod'u biliyor
- `initialCandidates` havuzuna `buildTekilCandidates(...)` ciktilari eklendi
- iterasyon sirasinda `collectBestLossPatternEvaluations(...)` sonuclarindan tekrar komsu adaylar da uretildi

Bu son madde onemli:

- TekilMod sadece baslangicta farkli aday atip sonra eski yola donmuyor
- arama sirasinda da "farkli kayip imzalari" tasiyan iyi adaylarin cevresini daha cok kurcaliyor

## Batch Run Karari Neden Ayrica Guncellendi

Optimizer birden fazla tur kosunca, turlar arasi "hangi sonuc daha iyi" secimi `optimizer.js` icindeki `pickBetterOptimizerResult(...)` ile yapiliyor.

Eger burasi guncellenmeseydi su sorun olurdu:

- tek bir run icinde Tekil onceligi dogru calisir
- ama 10 tur sonunda final secim tekrar eski `loss / win rate` mantigina kayardi

Bu nedenle ayni Tekil oncelik mantiginin `optimizer.js` tarafina da uyarlanmis bir kopyasi eklendi.

Boylece:

- run ici secim
- run'lar arasi final secim

aynı mantikla davranir.

## Comparison ve Kayit Sistemine Etkisi

TekilMod sonucunda bulunan adaylarin sonradan da dogru temsil edilmesi gerekiyordu.

Bu nedenle:

- `modeLabel` icine `TekilMod` eklendi
- comparison snapshot label sistemi `Standart / Cesitlilik / TekilMod / Cesitlilik + Tekil` destekler hale getirildi
- favorilere eklenen dizilimler mod bilgisini tasiyor
- onayli kayitlar mod bilgisini tasiyor
- restore-from-query sirasinda TekilMod da geri yukleniyor

Bu secim, sonradan ayni dizilimin hangi flavor ile bulundugunu anlamayi kolaylastiriyor.

## Mobil Yerlesim Karari

Istek acik olarak soyleydi:

- mobilde butonlar tek satirda olsun
- Cesitlilik Modu ile TekilMod yan yana dursun

`styles.css` tarafinda bunun icin yeni bir sarmalayici eklendi:

- `.optimizer-mode-toggle-row`

Bu kapsayici:

- masaustunde inline-grid
- mobilde iki kolonlu sabit satir

olarak ayarlandi.

Boylece `actions` kapsayicisi mobilde tek kolon olsa bile, mod butonlari kendi iclerinde iki kolonlu kalabiliyor.

## Dogrulama

Kod degisikligi sonrasinda su kontroller yapildi:

- `node --check optimizer.js`
- `node --check battle-core.js`

Ikisi de basarili gecti.

Ardindan deploy yapildi:

- `firebase.cmd deploy --only hosting`

Deploy basarili oldu.

Hosting:

- `https://bt-analiz.web.app`

## Bilincli Olarak Yapilmayanlar

Bu calismada bilincli olarak su alanlara dokunulmadı:

- yeni bir objective dropdown secenegi eklenmedi
- reliability sayfasinda TekilMod'a ozel yeni UI eklenmedi
- top results sort icin ayri bir "tekil once" siralama butonu eklenmedi
- mevcut diversity arama mantigi kaldirilmadi veya refactor edilmedi

Neden:

- istek minimum dosyayla, mevcut davranisi bozmadan yeni bir mod eklemekti
- bu nedenle mevcut optimizer hattina en az kirilimla entegre cozum secildi

## Sonuc

Ortaya cikan TekilMod, sadece "yeni bir buton" degil; su uc katmanda calisan yeni bir arama flavor'i oldu:

1. UI katmani:
   yeni toggle ve mobil yerlesim
2. optimizer state katmani:
   arama anahtarlari, kayitlar, comparison metadata
3. battle-core arama katmani:
   farkli aday uretimi + tekil kayip oncelikli karsilastirma

Bu yaklasimla kullanici istegindeki iki ana hedef ayni anda karsilandi:

- tekil kayip onceligi
- farkli bolgeleri tarayan ayri arama davranisi
