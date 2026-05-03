# Surrogate GPU Plan

Bu not, Colab GPU'sunu ana battle motorunu bozmadan nasil degerlendirecegimizi ozetler.

## Amac

Mevcut `battle-core.js` dogruluk referansi olarak kalir.
GPU ise iki yerde yardimci olur:

1. Cok sayida sentetik savas ornegi uretip veri seti biriktirmek
2. Bu veriyle hizli bir surrogate model egitmek

Bu model dogrudan "nihai dogru sonuc" yerine su islerde kullanilacak:

- cok sayida aday orduyu once hizli elemek
- seed sweep / optimizer aramalarini hizlandirmak
- pahali battle sim'lerini top adaylara saklamak

## Eklenen Job'lar

- `surrogate_dataset`
  Node battle motorunu kullanip `jsonl` veri seti uretir.
- `surrogate_train`
  PyTorch ile ikili bir model egitir:
  - kazanma olasiligi
  - normalize kan kaybi

## Beklenen Is Akisi

1. Colab worker acilir
2. `surrogate_dataset` ile 20k-100k ornek uretilir
3. Cikan `jsonl` dosyasi `surrogate_train`a verilir
4. Model artifact'i ve metrics JSON kaydedilir
5. Ileride optimizer tarafina "once surrogate ile tara, sonra exact sim yap" katmani eklenir

## Guvenli Sinir

Bu calisma ana uygulama mantigini degistirmez.
Battle sonucu hala `battle-core.js` ile uretilir.
Surrogate yalnizca hizlandirma/aday siralama katmani icin dusunulmelidir.

## Ilk Hedef

Ilk pratik hedef:

- 20k ornek dataset
- tek GPU ile kisa egitim
- validation accuracy / blood loss hata metriklerini gormek
- sonra optimizer entegrasyonuna degip degmeyecegine karar vermek
