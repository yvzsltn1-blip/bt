# Report Risk Plan

Bu not, `yanlis.txt` ve `dogru.txt` disa aktarimlarindan GPU yardimli ne yapildigini ozetler.

## Ilk Bulgular

- Yanlis ornek sayisi: 11
- Dogru ornek sayisi: 94
- Yanlislarda en baskin sapma T6 kaybi tarafinda
- Ikinci sinyal T3 kaybi tarafinda
- Yanlis ornekler neredeyse hep daha agir dusman kompozisyonlari icinde geliyor
- Ozellikle T8-T10 dusman varligi yanlis setinde belirgin sekilde daha yuksek

## Hedef

Kalici urun entegrasyonu yapmadan Colab GPU'sunu arastirma araci olarak kullanmak:

1. wrong/correct raporlari ortak veri setine donusturmek
2. bu veri setinden "yanlis cikma riski" skorlayicisi egitmek
3. hangi feature'lar riski artiriyor gorup mekanik debug'ini daha hedefli yapmak

## Ilk GPU Isi

- Job: `report_risk_train`
- Girdi: `colab-workspace/data/report-truth/reports-combined.jsonl`
- Cikti:
  - validation metrikleri
  - full dataset metrikleri
  - en guclu pozitif feature weight'leri
  - en guclu negatif feature weight'leri

Bu skorlayici oyun sonucunu degistirmez.
Amac, "hangi savaslarda simulasyon daha riskli olabilir?" sorusuna pratik bir arastirma cevabi uretmektir.
