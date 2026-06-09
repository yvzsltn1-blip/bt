# Simulator Arastirma Raporu - 2026-06-09

## Amac

`test-sonuclari-1-40` dizinindeki gercek savas raporlarini kullanarak:

- mevcut dogru sonuclari bozmamak,
- yanlis sonuclanan savaslari duzeltmek,
- veri ezberleyen ozel kurallar yerine gercek bir motor hatasi bulmak.

## Kullanilan Veri

- Dogru savas: `1.946`
- Yanlis savas: `79`
- Yanlis dosyasi:
  `test-sonuclari-fail-kat1-40-tumu79-20260609-1536.txt`
- Dogru dosyalari: Kat `1-40` arasindaki sekiz `pass` arsiv dosyasi
- Rastgele Kultist davranisi icin dogrularda `64`, yanlislarda `1.024` seed tarandi.
- Kalan vakalar ayrica `65.536` seede kadar tarandi.

Baslangic durumu:

| Kume | Tam eslesen |
|---|---:|
| Dogrular | 1.946 / 1.946 |
| Yanlislar | 0 / 79 |

## Bulunan Kok Hata

Rotmaw overkill sonrasi yeni hedef secilirken
`findDefenderForAttacker` fonksiyonu yanlis parametrelerle cagriliyordu.

Fonksiyon imzasi:

```js
findDefenderForAttacker(
  attackerIndex,
  unitNumbers,
  unitHealth,
  unitSpeed,
  defenderOrderFrontFirst,
  defenderOrderRearFirst,
  roundCount
)
```

Eski cagrida `unitSpeed` eksikti. Bundan sonraki parametreler bir basamak
kayiyor ve overkill icin hatali hedef sirasi kullaniliyordu.

Uygulanan duzeltme:

```js
const nextTarget = findDefenderForAttacker(
  attackerIndex,
  unitNumbers,
  unitHealth,
  unitSpeed,
  defenderOrderFrontFirst,
  defenderOrderRearFirst,
  roundCount
);
```

Bu hata normal saldiri hedeflemesini degil, yalnizca Rotmaw bir grubu yok
ettikten sonraki tasan hasar hedefini etkiliyordu. Bu nedenle genel olarak
iyi calisan motorda az sayida fakat tekrar eden sapmalar olusturuyordu.

## Duzeltme Sonucu

| Kume | Once | Sonra |
|---|---:|---:|
| Dogrular | 1.946 / 1.946 | 1.946 / 1.946 |
| Yanlislar | 0 / 79 | 62 / 79 |

Sonuc:

- Mevcut dogrularin hicbiri bozulmadi.
- `79` yanlisin `62` tanesi tam olarak duzeldi.
- Kan kaybi, birlik kayiplari ve kazanan taraf birlikte kontrol edildi.

Eklenen regresyon testi:

- `tests/test-rotmaw-overkill-targeting.js`
- Yanlis rapor #4 kullanildi.
- Beklenen: muttefik zaferi, `65` kan, `T1 x3` ve `T4 x1` kaybi.

## Referans ve Resmi Kurallar

Kontrol edilen kaynaklar:

- Resmi Q&A:
  https://forum.bitefight.gameforge.com/forum/thread/12923-path-to-ancestry-q-a/
- Topluluk simulator tartismasi:
  https://forum.bitefight.gameforge.com/forum/thread/12810-ancestral-ruins-combo-making/?pageNo=15
- Yerel Python referansi:
  `_web-disi/python/simulate_vampire_v5.1.py`

Resmi Q&A ile dogrulanan ilgili kurallar:

- Hasar mevcut birlik sayisina gore hesaplanir.
- Hasar yukari yuvarlanir.
- Esit hiz ve pozisyonda oyuncu birligi once saldirir.
- Hedef seciminde esit hiz/pozisyonda buyuk grup once secilir.
- Zombi pasifi grup tamamen yok edilince bir kez tetiklenir.
- Zombiyi olduren saldirinin fazla hasari dirilen gruba gecmez.
- Rotmaw disinda fazla hasar baska gruba tasinmaz.
- Bonuslar carpimsal uygulanir.

Python referansindaki Rotmaw hedef secimi de duzeltilmis JS ile ayni
sonucu verdi: `1.946/1.946` dogru ve `62/79` yanlis duzelmis.

## Denenen ve Elenen Hipotezler

### Zombi dirilis zamanlamasi

Dirilisi Rotmaw overkill hedef seciminden once yapmak denendi.

- Dogrular: `1.941 / 1.946`
- Yanlislar: `62 / 79`

Yeni vaka duzeltmedi ve `5` dogruyu bozdu. Uygulanmadi.

### Dirilen Zombiye ayni raund saldiri hakki

Dirilen grubun sirasi gecmisse attacker listesine yeniden eklenmesi denendi.

- Dogrular: `1.355 / 1.946`
- Yanlislar: `62 / 79`

Tek basina yeni tam duzeltme getirmedi ve buyuk regresyon olusturdu.

### Zombi oldurulurken overkill uygulanmamasi

Rotmaw overkill'inin Zombi, Diriltilmis Zombi veya her ikisi icin
engellenmesi ayri ayri denendi.

| Varyant | Dogrular | Yanlislar |
|---|---:|---:|
| Zombide overkill yok | 1.934 / 1.946 | 62 / 79 |
| Diriltilmis Zombide overkill yok | 1.936 / 1.946 | 62 / 79 |
| Ikisinde de yok | 1.924 / 1.946 | 62 / 79 |

Yeni duzeltme getirmedigi icin uygulanmadi.

### Overkill yok + ayni raund dirilmis saldirisi

Bu iki davranis birlikte #1, #2 ve #3 vakalarini duzeltti:

- Dogrular: `1.347 / 1.946`
- Yanlislar: `65 / 79`

Fakat `599` dogru savasi bozdu. Genel kural olamaz.

Ayni iki davranisi rastgele bir dal olarak sunmak seed aramasinda
`1.946/1.946` ve `65/79` verdi. Ancak resmi olarak dogrulanmayan yeni bir
rastgelelik ekleyecegi ve gercek olasilik dagilimini bilinmedigi icin
uretim koduna alinmadi.

### Rotmaw T8 canini dusurmek

Toplulukta onerilen `90 -> 88 HP` dahil farkli degerler denendi.

| T8 HP | Dogrular | Yanlislar |
|---|---:|---:|
| 89 | 1.586 / 1.946 | 61 / 79 |
| 88 | 1.456 / 1.946 | 61 / 79 |
| 87 | 1.382 / 1.946 | 56 / 79 |
| 86 | 1.322 / 1.946 | 53 / 79 |
| 85 | 1.239 / 1.946 | 54 / 79 |

`88 HP`, kalan #8 ve #64 gibi bazi vakalari yakalasa da yuzlerce dogru
savasi bozuyor. T8 gercek istatistigi `90 HP` oldugu icin uygulanmadi.

### Kultist bonusunu carpimsal yapmak

`unitBuffs += 0.1` yerine `unitBuffs *= 1.1` denendi.

- Dogrular: `1.946 / 1.946`
- Yanlislar: `62 / 79`

Bu veri setinde sonucu degistirmedi. Mevcut gorev icin uygulanmadi.

### Saldirgan sirasi ve tie-break

Python referansindaki birlik sayisi/rank tie-break'i JS'e uyarlandi.

- Dogrular: `1.946 / 1.946`
- Yanlislar: `62 / 79`

Sonuclari degistirmedi. Gereksiz degisiklik yapilmadi.

Esit hizda dusmana oncelik veren varyantlar da denendi:

- Yalnizca `208-210` dogru savas korunabildi.
- Yanlislardan yalniz `3` tanesi eslesti.

Resmi oyuncu-onceligi kuralina da aykiri oldugu icin elendi.

### Diger elenen fikirler

Asagidaki varyantlar yeni guvenli tam eslesme uretmedi veya dogrulari bozdu:

- son saldirgan/olen grubun karsilik vermesi,
- defender tip avantajlarini devre disi birakmak,
- overkill hasarini azaltmak veya kaldirmak,
- Kultist bonusunu dirilen Zombiye tasimak,
- dirilen Zombi adet hesabinda `7 HP` yerine `1 HP` kullanmak,
- genel T8 can araligi taramasi,
- farkli saldiri sonu ve savas bitis zamanlamalari.

## Kalan Vakalar

Guvenli duzeltmeden sonra tam eslesmeyen rapor numaralari:

```text
1, 2, 3, 8, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 64, 70, 79
```

Onemli desenler:

- Cogu vakada simulator gercekten bir eksik `T8` kaybi hesapliyor.
- #1-3, Zombi dirilisi ile Rotmaw overkill/sira etkilesimine duyarlı.
- #70'te T8 bulunmuyor; bu vaka ayri bir mekanik hataya isaret ediyor.
- #79'da iki taraf da tamamen yok oluyor. Birlik kayiplari ve kan ayni,
  yalnizca kazanan taraf farkli. Beraberlik/savas bitis karari incelenmeli.
- Kalan `17` vaka `65.536` seed taramasinda da mevcut motorla uretilmedi.

## Sonraki Calisma Icin Onerilen Yol

1. Kalan #1-3 icin oyundan raund/hamle bazli tam log veya ekran kaydi topla.
2. Diriltilmis Zombinin ayni raund saldiri hakki olup olmadigini kesinlestir.
3. #70'i T8 ve Rotmaw mekaniginden bagimsiz ayri bir hata olarak incele.
4. #79 icin iki tarafin ayni hamlede yok oldugu durumda sunucunun kazanan
   belirleme kuralini test et.
5. Yeni bir degisiklikte koruma esigi olarak mutlaka `1.946/1.946` kullan.

## Degisen Dosyalar

- `battle-core.js`
  - Rotmaw overkill hedef secimine eksik `unitSpeed` parametresi eklendi.
- `tests/test-rotmaw-overkill-targeting.js`
  - Bulunan hatayi tekrar olusmaktan koruyan regresyon testi eklendi.

## Son Dogrulama

Calistirilan testler:

```powershell
node tests\test-rotmaw-overkill-targeting.js
node tests\test-battle-rounding-policy.js
git diff --check -- battle-core.js tests/test-rotmaw-overkill-targeting.js
```

Sonuc:

- Rotmaw regresyon testi gecti.
- Rounding policy testi gecti.
- Diff bicim kontrolu gecti.
- Arsiv regresyonu: `1.946/1.946`
- Duzelen yanlis: `62/79`
