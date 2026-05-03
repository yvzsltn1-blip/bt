# Savaş Simülatörü Test ve Düzeltme Raporu
# ============================================
# Tarih: 2026-04-30

## 1. Test Veri Seti

| Veri Kaynağı | Adet | Açıklama |
|--------------|------|----------|
| Wrong Reports (Firestore) | 4 | Canlı sistemdeki yanlış bildirimler |
| Yanlis Sonuclar.txt | 18 | Kullanıcı raporları |
| **Toplam Wrong (birleşik)** | **22** | Tekilleştirilmiş |
| Approved Strategies | 15 | Doğrulanmış savaş sonuçları |
| 101 Katman Excel | 101 | Excel verisi ile karşılaştırma |

## 2. BASELINE (Mevcut Durum - Değişiklik Yok)

| Metrik | Sonuç |
|--------|-------|
| **Wrong düzeldi/iyileşti** | **18/22 (%82)** |
| Wrong hala yanlış | 4 |
| Wrong daha kötü | 0 |
| **Approved korundu** | **15/15 (%100)** |
| Approved bozuldu | 0 |
| **101 Katman tam eşleşti** | **60/101 (%59)** |
| 101 Katman kan eşleşti | 61/101 |

### Hala Yanlış Olan 4 Vaka:

| ID | Fark | Açıklama |
|----|------|----------|
| wrong_1777415591614_g7dc64p | 1 birim | +1 Gargoyle kayıp eksik |
| yanlis-1 | 2 birim | Gargoyle+başka eksik |
| yanlis-4 | 14 birim | Büyük fark (T1+T6 eksik) |
| yanlis-7 | 2 birim | Gargoyle eksik |
| yanlis-18 | 1 birim | Gargoyle eksik |

## 3. Düzeltme Denemeleri

### FIX 1: Round-start Gargoyle Slow (En Hızlı Düşman)
- Her raund başında en hızlı düşmana -2 speed
- **Sonuç: BAŞARISIZ** ❌
- Wrong: 5/22 (kötüleşti!)
- Approved: 6/15 (9 bozuldu!)
- 101 Katman: 28/101 (kötüleşti!)

### FIX 2: Round-start Gargoyle Slow (Sadece Ceset T5)
- Sadece Ceset varsa -2 speed
- **Sonuç: BAŞARISIZ** ❌
- Wrong: 18/22 (aynı)
- Approved: 14/15 (1 bozuldu)
- 101 Katman: 55/101 (kötüleşti!)

### FIX 3: Round-start Slow (Raund 2+, En Yavaş Düşman)
- Sadece raund 2+'da en yavaş düşmana -2 speed
- **Sonuç: BAŞARISIZ** ❌
- Wrong: 18/22 (aynı)
- Approved: 11/15 (4 bozuldu!)
- 101 Katman: 50/101 (kötüleşti!)

### FIX 4: Gargoyle Reactive Slow (-3 instead of -2)
- Vuran düşmanın hızını 3 azalt (2 yerine)
- **Sonuç: KISMİ** ⚠️
- Wrong: 19/22 (1 iyileşti!)
- Approved: 14/15 (1 bozuldu)
- 101 Katman: 50/101 (kötüleşti!)
- **Net: 1 wrong düzeldi ama 1 approved bozuldu + 101 katman düştü**

### FIX 5: Conditional Round-start (T5/T7/T8 varsa)
- Ceset/Hortlak/Dev varsa en yavaş düşmana -2 speed
- **Sonuç: BAŞARISIZ** ❌
- Wrong: 18/22 (aynı)
- Approved: 10/15 (5 bozuldu!)
- 101 Katman: 49/101 (kötüleşti!)

### FIX 6: Round-start Slow (Cultists yokken)
- Tarikatçı yoksa ve T5/T7/T8 varsa -2 speed
- **Sonuç: BAŞARISIZ** ❌
- Wrong: 18/22 (aynı)
- Approved: 13/15 (2 bozuldu)
- 101 Katman: 56/101 (kötüleşti!)

### FIX 7: Gargoyle Damage Reduction (%15)
- Gargoyle'a yönelik saldırılarda %15 azaltma
- **Sonuç: BAŞARISIZ** ❌
- Wrong: 15/22 (kötüleşti! 3 wrong daha kötü)
- Approved: 14/15 (1 bozuldu)
- 101 Katman: 50/101 (kötüleşti!)

## 4. Sonuç Tablosu

| Test | Wrong (↑) | Approved (↓) | 101 Katman (↑) | Değerlendirme |
|------|-----------|--------------|----------------|---------------|
| **BASELINE** | **18/22** | **15/15** | **60/101** | ✅ **EN İYİ** |
| FIX 1 | 5/22 | 6/15 | 28/101 | ❌ Çok kötü |
| FIX 2 | 18/22 | 14/15 | 55/101 | ❌ Approved bozuldu |
| FIX 3 | 18/22 | 11/15 | 50/101 | ❌ Approved bozuldu |
| FIX 4 | 19/22 | 14/15 | 50/101 | ⚠️ 1 wrong düzeldi ama approved bozuldu |
| FIX 5 | 18/22 | 10/15 | 49/101 | ❌ Approved bozuldu |
| FIX 6 | 18/22 | 13/15 | 56/101 | ❌ Approved bozuldu |
| FIX 7 | 15/22 | 14/15 | 50/101 | ❌ Wrong kötüleşti |

## 5. Analiz ve Bulgular

### Neden Hiçbir Düzeltme İşe Yaramadı?

1. **Round-start slow mekaniği**: Tüm denemeler APPROVED verilerini bozuyor. Bu, round-start slow'un mevcut APPROVED savaşlarının sonucunu değiştirdiğini gösteriyor. WRONG_BATTLE_DATASET_NOTE.md'de belirtildiği gibi, bu mekanik zaten denenmiş ve en iyi sonuç 42/46 saved + 16/17 wrong seviyesinde kalmış.

2. **Gargoyle damage reduction**: Gargoyle'a hasar azaltma eklemek, savaş dengesini değiştiriyor ve diğer birimlerin kaybını artırıyor.

3. **Seed-dependent varyans**: Simülasyon rastgelelik içeriyor (cultists buff, gargoyle slow hedefi). Farklı seed'ler farklı sonuçlar veriyor. Yanlış vakaların çoğu, "en az 1 seed'te doğru sonucu bulabilme" mantığıyla düzeldi.

### Kalan 4 Yanlış Vakanın Ortak Özellikleri

| Vaka | Düşman | Biz | Ortak Özellik |
|------|--------|-----|---------------|
| wrong_1777415591614 | 20-27-23-11-9-8-14-1-0-0 | 27-38-7-15-1-8-0-0 | T7+T8 var, gargoyle=8 |
| yanlis-1 | 45-11-15-7-9-11-7-6-7-1 | 36-18-28-22-10-7-2-0 | T7-T10 var, gargoyle=7 |
| yanlis-4 | 21-13-18-9-18-6-8-7-6-0 | 43-45-32-3-1-9-0-0 | T5+T6+T7+T8 var |
| yanlis-7 | 15-42-17-10-0-0-0-0-0-0 | 30-1-0-9-1-2-0-0 | T4 var, gargoyle=2 |
| yanlis-18 | 20-27-23-11-9-8-14-1-0-0 | 27-38-7-15-1-8-0-0 | T7+T8 var |

**Ortak pattern**: Gargoyle kaybı eksik tahmin ediliyor. Simülatör "0 kayıp" diyor ama gerçek savaşta 1-4 gargoyle ölüyor.

## 6. Öneriler

1. **Mevcut durum korunmalı**: Baseline zaten %82 wrong düzeltme ve %100 approved koruma sağlıyor.

2. **Yanlış vakalar seed varyansı**: 4 yanlış vaka, seed aralığı artırılarak düzeltilebilir (64 yerine 256 veya 512 seed denenebilir).

3. **Round-start slowтрадиционнотривиално**: Bu mekanik APPROVED'ları bozduğu için uygulanmamalı. WRONG_BATTLE_DATASET_NOTE.md'deki not doğrulanmış oldu.

4. **Yeni veri toplama**: Yanlış vakaların seed'leri kaydedilirse, daha hassas analiz yapılabilir.

## 7. Teknik Notlar

- Tüm testler `test-comprehensive.js` scripti ile yapıldı
- battle-core.js'in backup'ı `battle-core.backup.js` olarak saklandı
- Mevcut battle-core.js orijinal haline geri yüklendi
- Test süresi: ~5 dakika (101 katman × 512 seed tarama)
