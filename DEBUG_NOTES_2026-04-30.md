# Debug Notes - 2026-04-30

Bu dosya, `T6` sonrasi simulator sapmalari icin yapilan arastirmayi toplu halde saklamak icin olusturuldu.

## Durum

- Kullanici ilk etapta `T6` sonrasi kalan sapmalari arastirmamizi istedi.
- Forum Q&A kaynagi incelendi:
  - https://forum.bitefight.gameforge.com/forum/thread/12923-path-to-ancestry-q-a/?action=firstNew
- Kullanici sonradan yanlis listesini guncelledi ve artik elinde `5` canli yanlis vaka oldugunu belirtti.
- Bu dosyadaki sayisal sonuclar, agirlikli olarak arastirma sirasinda kullanilan su veri setlerine dayanir:
  - `saved-filtered-20260430033426.txt`
  - `wrong-filtered-20260430034007.txt`
  - `sonuc-arsivi/Yanlis Sonuclar.txt`
  - `wrongReports.firestoredump.json`
  - `approvedStrategies.firestoredump.json`

## Forumdan Dogrulanan Kurallar

- `T6 / Gargoyle` debuff'u sadece `T6` grubuna dogrudan saldiran dusman grubuna uygulanir.
- Debuff stacklenir.
- `T6` grubu olduktan sonra bile debuff etkisi kalir.
- Hiz `1` altina hatta negatife dusebilir.
- Hedef seciminde:
  - once pozisyon
  - sonra speed
  - ayni speed ve ayni pozisyonda daha buyuk grup sayisi
- Zombie dirilisi:
  - pasif sadece tum grup silinince tetiklenir
  - baslangictaki orijinal adetle geri gelir
  - her biri `1 HP` ile geri gelir
- Broodmother:
  - kac tane Broodmother kalirsa kalsin `10 Spiderling` uretir
- Wraith:
  - forum ornegi, mevcut koddaki carpandan daha agresif bir carpana isaret ediyor
  - ama bunu tek basina koda uygulamak buyuk regresyon uretiyor

## En Guclu Bulgular

### 1. Revived zombie sayim mantigi problemli gorunuyor

Mevcut kod:

- `battle-core.js`
- `REVIVED_INDEX` kalan adet hesabi
- halen `Zombie` base HP `7` ile yapiliyor

Sorun:

- forum mantigina gore dirilen grup `1 HP/unit` ile yasamaya devam ediyor
- bu nedenle loglarda imkansiz durumlar olusuyor
- tipik ornek:
  - `1 birim / 6 can` yerine
  - aslinda `6 birim / 6 can` olmasi gerekiyor

Not:

- bu degisiklik tek basina dogru bir sinyal veriyor
- ozellikle `yanlis-7` benzeri vakalarda sonucu gercege yaklastiriyor
- fakat `saved-filtered` veri setinde buyuk regresyon olusturuyor
- bu nedenle su an uygulanmadi

### 2. Broodmother spawn zamanlamasi ikinci bir sinyal tasiyor

Deney sonucu:

- `Broodmother` raund basinda yeterince buyuk bir grupsa
- o raundun sonunda grup olu olsa bile spawn etkisinin devam etmesi
- bazi zor vakalari gercege yaklastiriyor

En guvenli bulunan dar varyant:

- raund basinda `broodmothers >= 6` ise
- raund sonunda grup olu olsa bile `10 spiderling` dogumu korunuyor

Bu varyant:

- `saved-filtered-20260430033426.txt` icinde `87/87` korundu
- `wrong-filtered-20260430034007.txt` icinde yeni tam fix uretmedi
- ama bazi kalan buyuk sapmalari yaklastirdi

### 3. Kalan `+1 Gargoyle` farklari icin Revenant etkileşimi guclu bir aday

Denenen hipotez:

- `Revenant -> Gargoyle` saldirisinda mevcut brute-vs-monster cezasi fazla sert olabilir

Sonuc:

- `wrong_1777415591614_g7dc64p`
- `yanlis-18`

gibi inatci `+1 Gargoyle` farklarini kapatmaya cok yakin bir sinyal verdi.

Ama:

- `saved-filtered` veri setinde `87/87` korunmadi
- bu nedenle uygulanmadi

## Denenen Hipotezler

Asagidaki hipotezler denendi ve genel olarak guvenli cikmadi:

- round-start `T6` slow
- random ya da deterministic round-start `T6` target secimi
- `T6` reactive slow miktarini `-2` yerine `-3` yapmak
- `Gargoyle` hasar azaltmasi eklemek
- `Wraith` forumdaki carpani dogrudan uygulamak
- `Gargoyle` reactive slow sonrasi ayni raund `attackerOrder`'i da yeniden kurmak
- `T6` slow etkisini ayni raund hic reorder etmeden sonraki raunda ertelemek
- `Broodmother` spawn'i tum durumlarda round-start ya da post-death aktif yapmak

Genel gozlem:

- `T6` sonrasi kalan hatalar tek bir gizli kuralla aciklanmiyor
- daha cok:
  - revive zamani
  - spawn zamani
  - dar hasar/modifier istisnalari
  - sira/hedef zinciri
  birlikte isliyor

## Veri Seti Sonuclari

### saved-filtered-20260430033426.txt

Bu dosyanin basliginda `87` kayit yaziyor ve gercekten `87` kayit var.

Onemli not:

- dosyada `Cultist` iceren savaslar var
- bunlarda tek kosum yaniltici olabilir
- seed aramali kontrol yapmak gerekiyor

Sonuc:

- baseline: `87/87`
- mevcut Broodmother patch'i ile: `87/87`

### wrong-filtered-20260430034007.txt

Bu dosya `19` kayit iceriyor.

Baseline:

- `14/19` tam dogru
- `1` ek vaka iyilesmis
- `4` vaka cozulmemis

Mevcut Broodmother patch'i ile:

- `14/19` tam dogru
- `2` vaka iyilesmis
- `2` vaka ayni
- `1` vaka kotulesmis

Yani:

- patch burada yeni bir `tam fix` uretmiyor
- sadece kalan vakalarin dagilimini degistiriyor

### sonuc-arsivi ve eski toplu taramalar

Arastirma sirasinda gorulen ana baseline:

- wrong tarafinda yaklasik `18/22`
- approved tarafinda `15/15`
- `101 layer exact` tarafinda `60/101`

Not:

- kullanici daha sonra aktif yanlis listesini `5` savasa indirdigini belirtti
- yeni `5` vakalik liste bu not yazilirken detayli tekrar analiz edilmedi

## Mevcut Koda Islenen Patch

Su an `battle-core.js` icinde duran tek yeni mantik:

- raund basinda `broodmothersRoundStartCount` saklaniyor
- raund sonunda spawn icin su kosul kullaniliyor:
  - mevcut Broodmother hayattaysa
  - veya raund basinda `>= 6` idi

Bu patch'in durumu:

- `saved 87/87` koruyor
- `wrong 19` icinde yeni tam fix uretmiyor
- kaldirilabilir veya tutulabilir
- stratejik olarak "guvenli ama dusuk getirili" bir patch

## Yardimci Arac

Arastirma hizlandirmak icin su script eklendi:

- `analyze-hypotheses.js`

Amaci:

- `battle-core.js` uzerine in-memory patch uygulayip
- farkli hipotezleri hizli sekilde veri setlerine karsi olcmek

Bu script ile ozellikle su varyantlar karsilastirildi:

- baseline
- revived zombie HP varyanti
- Broodmother varyantlari
- Revenant vs Gargoyle varyanti
- bunlarin kombinasyonlari

## Dikkat Edilecek Noktalar

- `saved-filtered` ve benzeri dosyalarda random savaslar oldugu icin tek seed ile karar vermemek gerekir
- `wrong` dosya adi, icindeki her kaydin hala bugunku motorda yanlis oldugu anlamina gelmiyor
- bir savasin "tam dogru" sayilmasi icin:
  - kayip dizilisi birebir
  - toplam blood birebir
  - random vakalarda uygun seed bulunmus olmali

## Sonraki Mantikli Adimlar

Kullanici yeni `5` canli yanlis ornek topluyor. Sonraki oturumda once bu `5` ornegi analiz etmek mantikli olur.

Oncelik sirasi:

1. Yeni `5` vakayi tek tek parse et
2. Her biri icin:
   - mevcut sonuc
   - gercek sonuc
   - son fark olusan raund
   - hangi birlikte koptugu
   cikar
3. `analyze-hypotheses.js` ile sadece bu `5` vakaya odakli dar hipotez testleri yap
4. `saved-filtered 87/87` koruma cizgisini referans kabul et

## Kisa Ozet

- `revived zombie HP` mantigi teorik olarak yanlis gorunuyor ama pratikte guvenli degil
- `Broodmother` spawn zamanlamasi gercek bir sinyal veriyor
- `Revenant -> Gargoyle` etkileşimi kalan `+1 Gargoyle` sapmalari icin guclu aday
- tek bir buyuk sihirli `T6` kuralindan cok, birkac dar mekanik birlikte sorun cikariyor
