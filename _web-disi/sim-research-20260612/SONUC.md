# Sim arastirmasi 2026-06-12 (aksam): fail-25 dosyasi vs Master_Auto_Adventure_6.0.2

## Sonuc: uzantidan cikarilabilecek yeni mekanik kalmadi; 25 yanlisin hicbiri motor yamasiyla duzelmiyor.

Taban olcum (canli motor, legacy + extround fallback): 2044/2044 dogru korunuyor
(bugun eklenen kat41-101 pass dosyasi dahil), 25 yanlisin 0'i eslesiyor.

## Denenen adaylar (uzanti worker motoruyla satir satir karsilastirmadan)

| Aday | Aciklama | Dogru | Duzelen |
|---|---|---|---|
| orderTie | Saldiri sirasi esitlik kiricisi: ayni hiz+saf+taraf grubunda sayi/tier (kemikkanat-hayalet, ceset-izbandut) | 2044/2044 | 0/25 |
| spiderNeutral | Orumcek yavrulari iki yonde tip-notr | 2044/2044 | 0/25 |
| lichMeleeOnly | Lich yayilmasi sadece yakin-dovus hedef oldurulunce | 2044/2044 | 0/25 |
| necroSingleRevive | Zombi dirilme dongusu Olu Cagirici sayacina tek olum | 2044/2044 | 0/25 |
| bonewingFirstAlive | Kemikkanat +%20 "o an ilk canli birim" kosulu | 2044/2044 | 0/25 |
| hepsi (5 bayrak) | | 2044/2044 | 0/25 |

Tek seed fark taramasi: 2069 savasin sadece 2'sinde fingerprint degisti (orderTie), digerleri tamamen etkisiz.
Yani extround sonrasi iki motor bu veri kumesinde davranissal olarak DENK; uzantinin kalan tek farki
extwitch (cadi cift raund tam saldiri) ve o daha once 18 dogruyu bozdugu icin elenmisti.

## Asil teshis: sunucu kirilimi

- Pass arsivi: 2037 s66 + 7 s62. s65 ve s61'den SIFIR dogru kayit var.
- Fail-25: 13 s65 + 1 s61 + 4 s62 + 7 s66.
- s65/s61 vakalarinin tamami "sim fazla kayip tahmin ediyor" yonunde (coju gercekte SIFIR kayipli zafer).
- Stat carpani taramasi (atk×hp 1.0-3.0 grid, allyStatMult destegi battle-core-exp.js'de):
  dusuk katlar (#2-#7) hp>=1.3 ile eslesiyor ama #8 (K9) atk>=2.1/hp>=2.9 istiyor,
  K33-39 (#11-#17) 3x statta bile ULASILMIYOR. Tek hesap/sunucu = tek profil varsayimi cokuyor.
  => s65'teki sifir-kayipli sonuclar motor parametreleriyle uretilemiyor; oyun tarafinda farkli bir
  sistem var (birim yukseltme/infusion seviyeleri tier-bazli olabilir, etkinlik bonusu veya savas
  sonrasi iyilesme). Uzanti da bunu MODELLEMIYOR (sabit stat tablolari).

## Kalan s66/s62 vakalari (11)

#6/#9 (K7/K10 binom kuyruk benzeri), #10 (K19 hedefleme anomalisi - kilitli), #18/#19 (K39/K41 - kilitli),
#20-#25 (1 birimlik sapmalar; 1024 seed + extround taramasinda yok).

## Oneri

- s65/s61 kayitlarini regresyon kumesinde ayri etiketlemek (motor hatasi degil, sunucu profili).
- s65'ten dogru (pass) kayitlar birikirse stat profili hipotezi yeniden test edilebilir
  (stat-scan.js hazir; allyStatMult={atk,hp} parametresi battle-core-exp.js'de).

Araclar: battle-core-exp.js (5 bayrak + allyStatMult), test-mech25.js, diff-scan.js, stat-scan.js
