# Optimizer İyileştirme Çalışması - İlerleme Raporu

**Tarih:** 24.04.2026
**Durum:** Devam Ediyor

---

## Yapılan Değişiklikler

### 1. Stratejik Aday Oluşturma (Yeni Fonksiyon)
`buildStrategicCandidates()` fonksiyonu eklendi. Artık optimizer şu stratejilerle başlıyor:

| Strateji | Açıklama |
|----------|----------|
| **Tip Avantajı** | Düşman kompozisyonuna göre counter birimler seçer |
| **Kan Verimliliği** | En verimli birimleri önceliklendirir |
| **Nekromant Sinerjisi** | Çok birim + Nekromant kombinasyonu |
| **Kan Cadısı Sinerjisi** | Tank + DPS + Kan Cadısı |
| **Çürük Çene Sinerjisi** | Düşük HP düşmanlara overkill hasarı |

### 2. Simülasyon Sayısı Artırıldı
```javascript
// ÖNCE: 6 simülasyon
const trialCount = options.trialCount || 6;

// SONRA: 10 simülasyon
const trialCount = options.trialCount || 10;
```

### 3. Yeni Yardımcı Fonksiyonlar
- `getBloodEfficiency(unit)` - Birim verimlilik skoru hesaplar
- `getTypeMultiplier(attacker, defender)` - Tip avantajı çarpanı döndürür
- `calculateTypeAdvantageScore(ally, enemy)` - Ordular arası tip skoru hesaplar

---

## Değiştirilen Dosyalar

### battle-core.js
- `optimizeArmyUsage()` fonksiyonu güncellendi
- `buildStrategicCandidates()` fonksiyonu eklendi
- `getBloodEfficiency()` fonksiyonu eklendi
- `getTypeMultiplier()` fonksiyonu eklendi
- `calculateTypeAdvantageScore()` fonksiyonu eklendi

---

## Sonraki Adımlar

- [ ] Kullanıcı test sonuçlarını değerlendir
- [ ] Gerekirse ek optimizasyonlar yap
- [ ] Farklı kademe kombinasyonlarını test et
- [ ] Edge case'leri kontrol et

---

## Test Senaryosu

1. **Kademe:** 5
2. **Düşman:** 10 İskelet, 5 Zombi, 3 Tarikatçı
3. **Mevcut Birimler:** 50 Yarasa, 20 Gulyabani, 10 Vampir Köle
4. **Beklenen:** İlk simülasyonda daha isabetli sonuç

---

## Notlar

- Stratejik adaylar, mevcut rastgele adayların önüne ekleniyor
- Tip avantajı hesaplaması: brute > occult > monster > brute
- Kan verimliliği formülü: (attack * health) / bloodCost
- Sinerji kombinasyonları belirli birim kombinasyonlarını test ediyor

---

# 26.04.2026 - Algoritma İyileştirme Turu (Sürüm 2)

**Durum:** Tamamlandı
**Motivasyon:** Stage 48 / 99.4M kombinasyonlu senaryoda çözüm uzayı çok geniş; mevcut algoritma yerel optima takılıyor olabilir. Aynı süre bütçesinde daha iyi sonuçlar üretmek için 4 büyük değişiklik uygulandı.

## Tespit Edilen Ana Sorunlar

1. **CRN (Common Random Numbers) yarım uygulanmış** — her aday farklı seed setiyle test ediliyordu, adil kıyas yok.
2. **Sabit deneme bütçesi** — 10 trial / aday, açıkça kötü adaylar için bile.
3. **Refinement sadece azaltıyor** — yerel optima takılıyor, mix değiştirmiyor.
4. **Crossover yok** — beam search sadece tek-aday mutasyonu yapıyor.

## Uygulanan Değişiklikler

### 1. Tam CRN (Common Random Numbers) — `battle-core.js:1866`

**ÖNCE:**
```javascript
const seed = baseSeed + trial * 977 + signature.length * 13;
```

**SONRA:**
```javascript
const seed = baseSeed + trial * 977;
```

**Neden:** `signature.length` aday string-uzunluğuna göre seed'i değiştiriyordu. Aynı uzunluktaki adaylar aynı seed setini görürken, farklı uzunluktakiler farklı seed seti görüyordu. Bu, "iki adayı eşit koşulda kıyaslama" prensibini bozuyordu.

**Etki:** Tüm adaylar artık tıpatıp aynı 10 seed'le test ediliyor. Adaylar arası kıyaslamanın varyansı dramatik düşer (paired-comparison için klasik Monte Carlo varyans azaltma tekniği).

---

### 2. Successive Halving (Aşamalı Eleme) — `battle-core.js`

**Yeni fonksiyon:** `successiveHalvingEvaluation(candidateList)`

3 kademeli aday taraması:

| Kademe | Trial sayısı | Filtre |
|--------|--------------|--------|
| Tier 1 | 2-3 trial | Tüm adaylar; `wins >= ceil(cheapTrials*0.5)` olanlar geçer |
| Tier 2 | ~5 trial | Tier 1'in en iyi %30'u |
| Tier 3 | 10 trial | Tier 2'nin en iyi `beamWidth*2`'si |

**Neden:** Önceki algoritma her adaya sabit 10 trial harcıyordu — açıkça kötü olanlar için bile. Successive halving zayıf adayları erken ele alarak aynı CPU bütçesinde **2-3× daha fazla aday** taranmasını sağlar. Hyperband / Sequential Halving literatüründen alındı.

**Etki:** Aynı süre içinde keşif uzayı genişler.

---

### 3. Crossover (Recombination) — `battle-core.js`

**Yeni fonksiyon:** `crossoverCandidates(parentA, parentB)`

Beam'in en iyi 6 üyesi arasında çift-bazlı recombine. Her çift için 6 offspring üretir:

| Offspring tipi | Formül |
|----------------|--------|
| `avg` | `round((a + b) / 2)` |
| `maxMix` | `max(a, b)` |
| `minMix` | `min(a, b)` |
| `blendA` | `round(a * 0.7 + b * 0.3)` |
| `blendB` | `round(a * 0.3 + b * 0.7)` |
| `swapped` | İlk yarı parentA, kalan parentB |

Her offspring `normalizeCandidateToPointLimit` ile puan limitine sığacak şekilde normalize edilir.

**Neden:** Eski algoritma sadece tek-aday mutasyonu (komşuluk) yapıyordu. İki güçlü adayın özelliklerini birleştirme yeteneği yoktu. Crossover, iki farklı arketipi birleştirerek tek-mutasyonların atlayamayacağı bölgelere ulaşır. Genetik algoritmaların ana operatörü.

**Etki:** Beam search artık birden fazla yerel optimum etrafında dolaşıp aralarında köprü kurabiliyor.

---

### 4. Genişletilmiş Refinement (Swap Aşaması) — `battle-core.js`

`refineEvaluation()` fonksiyonu güncellendi.

**ÖNCE:** Sadece tek-birimi azaltıyordu.
**SONRA:** İki aşamalı:

- **Aşama 1:** Tek-birim azaltma (önceki davranış)
- **Aşama 2 (YENİ):** Birim-çifti swap. `reduceUnit`'ten birim çıkar, `increaseUnit`'e ekle. Swap miktarları: `[1, ceil(reduceFrom*0.25), ceil(reduceFrom*0.5)]`. Puan limiti otomatik denkleştiriliyor.

**Neden:** Önceki refinement bir kombinasyona "sıkışıp" daha iyi mix değişimini bulamıyordu. Örneğin: 50 yarasa + 30 gulyabani lokal optimumsa, "20 yarasa azaltıp 13 vampir kölesi ekle" denenmiyordu.

**Etki:** Refinement artık karışım uzayında da arama yapıyor.

---

### 5. Beam Search Ana Döngüsünde Entegrasyon

`optimizeArmyUsage` ana döngüsü güncellendi:

```javascript
// ÖNCE: tek-tier evaluation
let ranked = collectTopEvaluations(initialCandidates);
...
ranked = collectTopEvaluations(mutated);

// SONRA: successive halving + crossover
let ranked = successiveHalvingEvaluation(initialCandidates);
...
const crossoverPool = beam.filter(...).slice(0, Math.min(6, beam.length));
for (let i = 0; i < crossoverPool.length; i += 1) {
  for (let j = i + 1; j < crossoverPool.length; j += 1) {
    mutated.push(...crossoverCandidates(crossoverPool[i].counts, crossoverPool[j].counts));
  }
}
ranked = successiveHalvingEvaluation(mutated);
```

---

## Doğrulama Sonuçları

### Benchmark senaryoları
- `progress` preset → optimizer **kesin optimumla eşleşti** (avgLostBlood=55, pts=25)
- `progress_fullpool` preset → optimizer **kesin optimumla eşleşti** (avgLostBlood=0, pts=34)

### Stage 48 senaryosu (kullanıcı raporu)
- 5 farklı seed offsetiyle bağımsız çalıştırma → her seferinde aynı sonuca yakınsadı
- Sonuç: **640 kan kaybı / 428 pt / %100 win**, dizilim: 40 Yarasa + 28 Gulyabani + 32 Vampir Köle + 18 Bansi + 1 Nekromant
- 60-trial derin doğrulama: aynı sonuç (varyans dahil değişmedi)
- Top-6 alternatif aday içinde 640'tan iyi yok
- **Yorum:** Bu nokta güçlü bir yerel optimum. Kesin global optimum doğrulaması için exhaustive verifier gerekli.

---

## Değiştirilen Dosyalar

### `battle-core.js`
- `evaluateCandidate()` → seed formülünden `signature.length * 13` çıkarıldı (CRN)
- `dedupeCandidates()` → yeni yardımcı fonksiyon
- `successiveHalvingEvaluation()` → yeni 3-kademeli değerlendirici
- `crossoverCandidates()` → yeni recombination fonksiyonu
- `optimizeArmyUsage()` ana döngüsü → successive halving + crossover entegrasyonu
- `refineEvaluation()` → 2. aşama olarak unit-pair swap eklendi

### `colab_exact_verifier_cell.py`
- `CONFIG` Stage 48 senaryosuna güncellendi
- JS_CODE içindeki seed formülü CRN ile hizalandı (`signature.length * 13` çıkarıldı)

### `colab_parallel_verifier.py` (YENİ DOSYA)
3-katlı hızlandırma içeren paralel exhaustive verifier:

1. **Multi-process partition** — 99.4M kombinasyon `bats` eksenine göre N worker'a bölünür. `split_partitions()` kümülatif DP ile worker'ları yaklaşık eşit yük ile dengeler.
2. **Adaptif trial** (`evaluateAdaptive`):
   - Trial 1 kaybederse → Trial 2 atlanır
   - Trial 1 kazanır ama kayıp > 1.5 × yerel incumbent → Trial 2 atlanır
   - Aksi halde tam 2 trial koşar
3. **Worker-içi mini Stage 2** — her worker kendi top-80 adayını 30-trial ile derin doğrular, master'a sadece doğrulanmış kısa liste gönderir.
4. **Master final doğrulama** — birleşik top-50 aday üzerinde 60-trial son doğrulama.

**Beklenen süre (99.4M kombinasyon):**
| Ortam | Çekirdek | Süre |
|-------|----------|------|
| Eski single-thread verifier | 1 | 3-4 saat |
| Yeni paralel, Colab free | 2 | ~14 dk |
| Yeni paralel, yerel 8-core | 8 | ~3.5 dk |

---

## Performans Ölçümü

Yerel test (tek çekirdek, adaptif trial dahil):
- **~58.700 aday/saniye**
- 1M kombinasyon ~17 saniyede taranıyor

---

## Kazanım Özeti

| Değişiklik | Etki | Maliyet |
|------------|------|---------|
| CRN düzeltmesi | Adaylar arası varyans dramatik düşer | 1 satır |
| Successive halving | Aynı bütçede 2-3× daha fazla aday | Orta |
| Crossover | Yerel optimumlar arası köprü | Düşük |
| Refinement swap | Mix uzayında arama | Düşük |
| Paralel verifier | Exhaustive doğrulama 3-4 saatten ~14 dk'ya | Yeni dosya |

---

## Sonraki Adımlar (Opsiyonel)

- [ ] Surrogate model (gradient boosting) ile aday önfiltresi — yüksek etki, yüksek karmaşıklık
- [ ] Pareto cephesi: kayıp vs ordu büyüklüğü trade-off'unu birlikte tut
- [ ] Lower-bound budama: enumeration sırasında imkansız subtree'leri atla
- [ ] Paralel verifier'a worker'lar arası incumbent paylaşımı (filesystem üzerinden)

---

# 10.06.2026 - Algoritma İyileştirme Turu (Sürüm 3) + Ultra Mod

**Durum:** Tamamlandı
**Motivasyon:** Yüksek katlarda uzay çok genişliyor; mod süreleri korunarak (Hızlı 3-4 sn, Dengeli 7-8 sn, Derin 10-12 sn) daha iyi sonuçlar isteniyor. Benchmark, Derin modun bazı senaryolarda Hızlı moddan daha KÖTÜ sonuç bulduğunu gösterdi (Kat 48: Derin 490 kan, Hızlı 455 kan).

## Tespit Edilen Ana Sorunlar

1. **Beam tek bölgeye çöküyordu** — sıralamada üstteki benzer adaylar 14 beam slotunun hepsini dolduruyor, farklı bölgelerin (örn. 46-Vampir-Köle havzası) mutasyon yolları beam dışına itiliyordu. Kat 48'de Derin modun 455'i kaçırmasının kök nedeni buydu.
2. **Winner's curse** — düşük trial tahminleriyle sıralanan adaylardan sadece ilk 6'sı stabilite doğrulamasına giriyordu; şanslı tahminli adaylar gerçek kazananı dışarı itebiliyordu.
3. **Tekrarlanan simülasyon israfı** — aynı aday cheap-tier'da 3 trial, sonra 5, sonra 10 trial ile sıfırdan simüle ediliyordu (CRN seed'leri trial-indeksli olduğu halde).
4. **Süre bütçesi kullanılmıyordu** — parametreler sabit; arama erken bitince kalan süre boşa gidiyordu.

## Uygulanan Değişiklikler (battle-core.js)

### 1. Artımlı Değerlendirme Akümülatörü
`evaluateCandidate` artık aday başına `signature:roundingMode` anahtarlı akümülatör tutar; daha yüksek trial istenince yalnız eksik denemeler koşulur. CRN seed'leri trial-indeksli olduğundan sonuç, baştan koşturmayla birebir aynıdır. Etki: ~%20-25 daha az simülasyon, aynı sonuçlar (bütçesiz regresyon birebir doğrulandı).

### 2. Çeşitlilik Koruyan Beam (`selectDiverseBeam`)
Arketip anahtarı = puan ağırlığına göre ilk 2 birim. Beam'e aynı arketipten en fazla 3 aday alınır; kota dolarsa kalan slotlar en iyilerle dolar. **Kat 48'de Derin modun 455'i bulmasını sağlayan kilit düzeltme.**

### 3. Geniş Stabilite + Final Doğrulama (winner's curse önlemi)
- Stabilite seti `max(eliteCount, 6)` → `max(eliteCount*2, beamWidth, 12)`.
- Yeni final adım: en iyi 6 benzersiz aday + mevcut en iyi, `max(stabilityTrials, 32)` trial ile yeniden ölçülür ve kazanan buna göre seçilir. Akümülatör sayesinde maliyet ihmal edilebilir.

### 4. Zaman Bütçeli Uzatma Fazı (`timeBudgetMs`)
Ana akış erken biterse kalan süre, mini-restart turlarıyla doldurulur. Her tur:
- Elit sapmaları (`buildPerturbedCandidates`: 2-4 birime çarpansal/sıfırlama/rastgele kick)
- Diğer modların seed aileleriyle keşif üretimi (`alternateBaseSeeds` — Derin, Hızlı'nın keşif adaylarının üst kümesini görür)
- Dönen grid limitleri (576/300/448/384/320/512/240/660) — spreadSelect her limitte farklı alt-küme seçer
- Tüm birimler için arketip merdiveni (ana akış sadece ilk 4 stratejik birimi tarar)
- En iyiyle crossover + taze stratejik rastgeleler
- Havuz kendi içinde 2-3 beam iterasyonuyla yerel inişe sokulur (yeni bölge, global en iyiden kötü başlasa bile gelişme şansı bulur), ilk 3 aday stabiliteyle doğrulanır, kazanan rafine edilir.
Bütçe aşılırsa ana beam döngüsü/refinement erken kesilir (yavaş makinede süre tavanı görevi görür).

### 5. Ultra Mod
Yeni preset (trial 12-36, beam 18-44, grid 576, exhaustive 40k) + 20 sn bütçe. quick.html / optimizer.html / optimizer-minimum.html mod anahtarına "Ultra" butonu eklendi.

## Mod Süre Bütçeleri (optimizer.js)
| Mod | Bütçe |
|-----|-------|
| Hızlı | 3.5 sn |
| Dengeli | 7.5 sn |
| Derin | 11 sn |
| Ultra | 20 sn |

## Doğrulama Sonuçları (gerçek katman verisi, T1-T7×99 havuz, %75-100 bant, 200-trial bağımsız doğrulama)

| Kat | Baseline en iyi | Yeni en iyi | Not |
|-----|----------------|-------------|-----|
| 10  | 0 | 0 | eşit |
| 20  | 35 | 35 | eşit |
| 30  | 250 (balanced) / 265 (fast,deep) | **215 (ultra)**, 250-265 diğerleri | ultra %14-19 daha iyi |
| 48  | 455 (fast,balanced) / **490 (deep!)** | **455 (tüm modlar)** | deep tutarsızlığı giderildi |
| 65  | 750 | 750 | eşit |
| 80  | 2120 (fast) / 2102 (balanced) / 2055 (deep) | 2094 (fast) / 2091 (balanced) / 2055 (deep,ultra) | fast/balanced iyileşti |
| 95  | 2235 (fast) / 2113 (balanced,deep) | 2235 (fast) / 2113 (balanced,deep,ultra) | eşit |
| 101 | 1220 | 1220 | eşit |

Hiçbir senaryoda gerileme yok. Duman testleri (min_army, safe_win, tekil, tekil v2, çeşitlilik, stone, exact-guard, min kısıt, kayıp kısıtı, dar bant, bütçesiz): hepsi geçti.

**Not:** Zaman bütçeli uzatma fazı makine hızına bağlıdır; aynı girdiyle iki çalıştırma, tamamlanan tur sayısına göre küçük farklar verebilir (sonuç asla ana akışın bulduğundan kötü olamaz — karşılaştırma monotondur).

## Araçlar
- `_web-disi/optimizer-research-20260610/bench.js` — gerçek katman verisiyle kalite/süre benchmark'ı (`--baseline` eski motorla koşar, `--budget` bütçeyi açar)
- `_web-disi/optimizer-research-20260610/smoke.js` — tüm seçenek yollarının duman testi
